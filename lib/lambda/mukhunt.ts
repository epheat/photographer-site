import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import middy from '@middy/core';
import { v4 as uuidv4 } from "uuid";
import cloudwatchMetrics, { Context } from '@middy/cloudwatch-metrics';
import { requireGroup } from './middleware';
import { error, fault, success } from "./responses";

// The hunt currently being played. A future hunt is a new set of records in the table, plus a bump here.
export const HUNT_ID = "2027";
export const ENTITY_ID = `MukHunt-${HUNT_ID}`;

const tableName = process.env.gameDataTableName;
const ddbClient = new DynamoDBClient({ region: "us-east-1" });
const ddb = DynamoDBDocument.from(ddbClient);

const clueResourceId = (clueId: string) => `Clue-${clueId}`;

/**
 * GET /games/mukhunt/hunt
 *
 * returns the hunt and all of its clues. Both live under the same partition, so this is one query.
 * The hunt record itself is created by hand in the table - there's only one hunt, so there's no API for it.
 */
async function getHuntActivity(event: APIGatewayProxyEventV2WithJWTAuthorizer, context: Context): Promise<APIGatewayProxyResultV2> {
  context.metrics.setProperty("RequestId", context.awsRequestId);
  try {
    const result = await ddb.query({
      TableName: tableName,
      KeyConditionExpression: "entityId = :entityId",
      ExpressionAttributeValues: {
        ':entityId': ENTITY_ID,
      },
    });
    const items = result.Items ?? [];

    const hunt = items.find(item => item.resourceId === "Hunt");
    if (!hunt) {
      return error({ message: `No hunt record found for ${ENTITY_ID}.` });
    }
    const clues = items
      .filter(item => item.resourceId.startsWith("Clue-"))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    return success({
      message: "Success.",
      hunt: {
        huntId: HUNT_ID,
        title: hunt.title,
        description: hunt.description,
        startDate: hunt.startDate,
        endDate: hunt.endDate,
      },
      clues: clues,
    });
  } catch (err) {
    console.log(err);
    return fault({ message: err });
  }
}

/**
 * POST /games/mukhunt/clues
 *
 * creates a clue when clueId is absent, and overwrites the existing one when it's present.
 * A plain put either way, so editing a clue replaces every field rather than patching.
 */
async function putClueActivity(event: APIGatewayProxyEventV2WithJWTAuthorizer, context: Context): Promise<APIGatewayProxyResultV2> {
  context.metrics.setProperty("RequestId", context.awsRequestId);
  if (!event.body) { return error({ message: "Invalid Request: Missing post body." }); }
  const request = JSON.parse(event.body);
  const clue = request.clue;

  if (!clue?.title || !clue?.description) {
    return error({ message: "Invalid Request: clue requires a title and a description." });
  }
  if (typeof clue.points !== "number" || clue.points < 0) {
    return error({ message: "Invalid Request: clue requires points, as a non-negative number." });
  }
  if (clue.sortOrder !== undefined && typeof clue.sortOrder !== "number") {
    return error({ message: "Invalid Request: sortOrder must be a number." });
  }

  const clueId = clue.clueId ?? uuidv4();
  try {
    await ddb.put({
      TableName: tableName,
      Item: {
        entityId: ENTITY_ID,
        resourceId: clueResourceId(clueId),
        resourceType: "Clue",
        clueId: clueId,
        title: clue.title,
        description: clue.description,
        points: clue.points,
        selfie: clue.selfie ?? false,
        sortOrder: clue.sortOrder ?? 0,
        lastUpdatedDate: Date.now(),
      },
    });
    return success({ message: "Success.", clueId: clueId });
  } catch (err) {
    console.log(err);
    return fault({ message: err });
  }
}

/**
 * POST /games/mukhunt/clues/delete
 *
 * a POST rather than a DELETE because the API's CORS config only allows OPTIONS/GET/POST.
 * Note this leaves behind any submissions players already made against the clue.
 */
async function deleteClueActivity(event: APIGatewayProxyEventV2WithJWTAuthorizer, context: Context): Promise<APIGatewayProxyResultV2> {
  context.metrics.setProperty("RequestId", context.awsRequestId);
  if (!event.body) { return error({ message: "Invalid Request: Missing post body." }); }
  const request = JSON.parse(event.body);
  if (!request.clueId) {
    return error({ message: "Invalid Request: missing clueId." });
  }
  try {
    await ddb.delete({
      TableName: tableName,
      Key: { entityId: ENTITY_ID, resourceId: clueResourceId(request.clueId) },
    });
    return success({ message: "Success." });
  } catch (err) {
    console.log(err);
    return fault({ message: err });
  }
}

// Muk Hunt API middleware functions

function getMetricsOptions(operation: string) {
  return {
    namespace: "PS-MukHunt-API",
    dimensions: [
      { "Operation": operation }
    ]
  }
}

export const getHunt = middy(getHuntActivity)
  .use(cloudwatchMetrics(getMetricsOptions("GetHunt")));

export const putClue = middy(putClueActivity)
  .use(requireGroup("Admins"))
  .use(cloudwatchMetrics(getMetricsOptions("PutClue")));

export const deleteClue = middy(deleteClueActivity)
  .use(requireGroup("Admins"))
  .use(cloudwatchMetrics(getMetricsOptions("DeleteClue")));
