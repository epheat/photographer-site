import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { APIGatewayProxyEventV2, APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import middy from '@middy/core';
import { v4 as uuidv4 } from "uuid";
import cloudwatchMetrics, { Context } from '@middy/cloudwatch-metrics';
import { requireGroup } from './middleware';
import { getUserInfo } from "./auth";
import { error, fault, success } from "./responses";

const tableName = process.env.imageMetadataTableName;
const ddbClient = new DynamoDBClient([{ region: "us-east-1" }]);
// DynamoDB document client abstracts the mapping from ddb attributes into javascript objects.
// docs: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html
const ddb = DynamoDBDocument.from(ddbClient);

const bucketName = process.env.imageDataBucketName;
// https://aws.amazon.com/blogs/developer/generate-presigned-url-modular-aws-sdk-javascript/
const s3Client = new S3Client([{ region: "us-east-1" }]);

/**
 * GET images/uploadUrl
 *
 * returns a s3 presigned url which can be used to upload an image.
 * additionally, creates a record in the EHImageMetadata table.
 */
async function getUploadUrlActivity(event: APIGatewayProxyEventV2WithJWTAuthorizer, context: Context): Promise<APIGatewayProxyResultV2> {
  context.metrics.setProperty("RequestId", context.awsRequestId);
  const { username, sub } = getUserInfo(event);
  if (!event.pathParameters?.imageFileName) {
    return error({ message: "Invalid Request: Missing imageFileName path parameter." });
  }
  const imageFileName = event.pathParameters.imageFileName;
  console.log(`Getting upload url for user ${sub}, imageFileName ${imageFileName}`);
  const imageId = uuidv4();
  const createdDate = Date.now();
  const imageKey = `images/${createdDate}_${imageFileName}`
  try {
    const putObjectCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: imageKey,
    })
    const uploadUrl = await getSignedUrl(s3Client, putObjectCommand, { expiresIn: 120 });
    const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${imageKey}`;
    const putResult = await ddb.put({
      TableName: tableName,
      Item: {
        imageId: imageId,
        createdDate: createdDate,
        author: username,
        authorSub: sub,
        s3Url: s3Url,
        ttl: Math.floor(createdDate / 1000) + 120, // created date plus 2 minutes (s)
      }
    });

    return success({
      message: "Success.",
      imageId: imageId,
      uploadUrl: uploadUrl,
      imageUrl: s3Url,
    });
  } catch (err) {
    console.log(err);
    return fault({ message: err });
  }
}

/**
 * POST images/metadata
 */
async function putImageMetadataActivity(event: APIGatewayProxyEventV2, context: Context): Promise<APIGatewayProxyResultV2> {
  context.metrics.setProperty("RequestId", context.awsRequestId);
  if (!event.body) { return error({ message: "Invalid Request: Missing post body." }); }
  const request = JSON.parse(event.body);
  console.log(`Putting image metadata. Request: ${event.body}`);
  if (!request.imageId) {
    return error({ message: "Invalid Request: missing required fields." });
  }
  const updatedDate = Date.now();

  try {
    const getResult = await ddb.get({
      TableName: tableName,
      Key: { imageId: request.imageId }
    });

    delete getResult.Item!.ttl;

    const putResult = await ddb.put({
      TableName: tableName,
      Item: {
        ...getResult.Item,
        title: request.title,
        description: request.description,
        updatedDate: updatedDate,
      }
    });
    return success();
  } catch (err) {
    console.log(err);
    return fault({ message: err });
  }
}

/**
 * GET images
 */
async function getAllImages(event: APIGatewayProxyEventV2, context: Context): Promise<APIGatewayProxyResultV2> {
  context.metrics.setProperty("RequestId", context.awsRequestId);
  try {
    const getResult = await ddb.scan({
      TableName: tableName,
    });
    return success({
      message: "Success.",
      items: getResult.Items,
    });
  } catch (err) {
    console.log(err);
    return fault({ message: err });
  }
}

// Images API middleware functions

function getMetricsOptions(operation: string) {
  return {
    namespace: "PS-Images-API",
    dimensions: [
      { "Operation": operation }
    ]
  }
}

export const getUploadUrl = middy(getUploadUrlActivity)
  .use(requireGroup("Admins"))
  .use(cloudwatchMetrics(getMetricsOptions("GetUploadUrl")));

export const putImageMetadata = middy(putImageMetadataActivity)
  .use(requireGroup("Admins"))
  .use(cloudwatchMetrics(getMetricsOptions("PutImageMetadata")));