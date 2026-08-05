import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import middy from '@middy/core';
import { v4 as uuidv4 } from "uuid";
import cloudwatchMetrics, { Context } from '@middy/cloudwatch-metrics';
import { requireGroup } from './middleware';
import { getUserInfo, userHasGroup } from "./auth";
import { deny, error, fault, success } from "./responses";

// The hunt currently being played. A future hunt is a new set of records in the table, plus a bump here.
export const HUNT_ID = "2027";
export const ENTITY_ID = `MukHunt-${HUNT_ID}`;

const tableName = process.env.gameDataTableName;
const imageMetadataTableName = process.env.imageMetadataTableName;
const bucketName = process.env.staticDataBucketName;

const ddbClient = new DynamoDBClient({ region: "us-east-1" });
const ddb = DynamoDBDocument.from(ddbClient);
const s3Client = new S3Client({ region: "us-east-1" });

const clueResourceId = (clueId: string) => `Clue-${clueId}`;
const submissionResourceId = (clueId: string) => `${ENTITY_ID}-Submission-${clueId}`;
const userPointsResourceId = () => `${ENTITY_ID}-UserPoints`;

// Clue ids are hand-written slugs rather than uuids, because they show up in the sort key of every
// submission and in every point history entry, where "lighthouse-selfie" beats a uuid when reading
// rows by hand. They're part of those keys, so a clue id is immutable once players start submitting.
const CLUE_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// 2 minutes is not enough for a multi-megabyte photo over cell service at the beach.
const UPLOAD_URL_EXPIRY_SECONDS = 300;
// How long an uploaded photo has to be claimed by a submission before its metadata row expires.
// Generous on purpose: reaping a row mid-upload would strand the photo.
const UNCLAIMED_IMAGE_TTL_SECONDS = 60 * 60 * 24;
const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
];
const MAX_CAPTION_LENGTH = 280;

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
      .filter(item => item.resourceId.startsWith("Clue-") && !item.deleted)
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
 * creates or replaces a clue. A plain put, so an edit replaces every field rather than patching.
 *
 * Creating is the default and refuses to clobber an existing clue, so a mistyped clue id fails
 * loudly instead of silently overwriting a clue that may already have submissions against it.
 * Editing an existing clue requires allowOverwrite, which the admin edit form sets.
 */
async function putClueActivity(event: APIGatewayProxyEventV2WithJWTAuthorizer, context: Context): Promise<APIGatewayProxyResultV2> {
  context.metrics.setProperty("RequestId", context.awsRequestId);
  if (!event.body) { return error({ message: "Invalid Request: Missing post body." }); }
  const request = JSON.parse(event.body);
  const clue = request.clue;

  if (!clue?.clueId) {
    return error({ message: "Invalid Request: clue requires a clueId, e.g. \"lighthouse-selfie\"." });
  }
  if (!CLUE_ID_PATTERN.test(clue.clueId)) {
    return error({ message: "Invalid Request: clueId must be lowercase letters, numbers, and single hyphens, e.g. \"lighthouse-selfie\"." });
  }
  if (!clue.title || !clue.description) {
    return error({ message: "Invalid Request: clue requires a title and a description." });
  }
  if (typeof clue.points !== "number" || clue.points < 0) {
    return error({ message: "Invalid Request: clue requires points, as a non-negative number." });
  }
  if (clue.sortOrder !== undefined && typeof clue.sortOrder !== "number") {
    return error({ message: "Invalid Request: sortOrder must be a number." });
  }

  const clueId = clue.clueId;
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
      ...(request.allowOverwrite ? {} : { ConditionExpression: "attribute_not_exists(resourceId)" }),
    });
    return success({ message: "Success.", clueId: clueId });
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") {
      // also covers a soft-deleted clue, which still holds its id so that old submissions keep resolving.
      return error({ message: `A clue with id "${clueId}" already exists, possibly a deleted one. Pass allowOverwrite to edit or restore it.` });
    }
    console.log(err);
    return fault({ message: err });
  }
}

/**
 * POST /games/mukhunt/clues/delete
 *
 * a POST rather than a DELETE because the API's CORS config only allows OPTIONS/GET/POST.
 *
 * A soft delete: the row stays and getHunt filters it out. Submissions reference a clue by id,
 * so keeping the record means they can always resolve back to a title when the album is built,
 * and the id stays claimed rather than being silently re-adopted by a later clue of the same name.
 * Restoring one is just a putClue with allowOverwrite, which replaces the item without the flag.
 */
async function deleteClueActivity(event: APIGatewayProxyEventV2WithJWTAuthorizer, context: Context): Promise<APIGatewayProxyResultV2> {
  context.metrics.setProperty("RequestId", context.awsRequestId);
  if (!event.body) { return error({ message: "Invalid Request: Missing post body." }); }
  const request = JSON.parse(event.body);
  if (!request.clueId) {
    return error({ message: "Invalid Request: missing clueId." });
  }
  try {
    await ddb.update({
      TableName: tableName,
      Key: { entityId: ENTITY_ID, resourceId: clueResourceId(request.clueId) },
      UpdateExpression: "SET deleted = :deleted, lastUpdatedDate = :now",
      // without this an update on a missing clue would upsert a stub row holding only the flag.
      ConditionExpression: "attribute_exists(resourceId)",
      ExpressionAttributeValues: {
        ':deleted': true,
        ':now': Date.now(),
      },
    });
    return success({ message: "Success." });
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") {
      return error({ message: `No clue found with id "${request.clueId}".` });
    }
    console.log(err);
    return fault({ message: err });
  }
}

/**
 * Loads the hunt record, which holds the submission window. Created by hand in the table.
 */
async function getHuntRecord() {
  const result = await ddb.get({
    TableName: tableName,
    Key: { entityId: ENTITY_ID, resourceId: "Hunt" },
  });
  return result.Item;
}

/**
 * Whether the hunt is currently accepting submissions. Admins bypass the window so the game can be
 * tested ahead of the weekend, which does mean "closed" never means closed for them.
 */
function submissionsOpen(hunt: any, event: APIGatewayProxyEventV2WithJWTAuthorizer, now: number): boolean {
  if (userHasGroup(event, "Admins")) return true;
  return now >= hunt.startDate && now <= hunt.endDate;
}

/**
 * GET /games/mukhunt/uploadUrl/{imageFileName}?contentType=image/jpeg
 *
 * returns a presigned url any logged-in player can use to upload one photo, plus the matching
 * EHImageMetadata record. The record carries a ttl until a submission claims it, so photos that
 * get picked and then abandoned don't pile up in the table forever.
 */
async function getUploadUrlActivity(event: APIGatewayProxyEventV2WithJWTAuthorizer, context: Context): Promise<APIGatewayProxyResultV2> {
  context.metrics.setProperty("RequestId", context.awsRequestId);
  const { username, sub } = getUserInfo(event);
  if (!event.pathParameters?.imageFileName) {
    return error({ message: "Invalid Request: Missing imageFileName path parameter." });
  }

  const createdDate = Date.now();
  try {
    const hunt = await getHuntRecord();
    if (!hunt) {
      return error({ message: `No hunt record found for ${ENTITY_ID}.` });
    }
    // checked again on submit; stopping it here just avoids uploading a photo that can't be used.
    if (!submissionsOpen(hunt, event, createdDate)) {
      return error({ message: "Submissions are closed for this hunt." });
    }

    // Phone filenames arrive with spaces and parens, and a stray slash would rewrite the key prefix.
    const fileName = decodeURIComponent(event.pathParameters.imageFileName).replace(/[^a-zA-Z0-9._-]/g, "_");
    const requestedContentType = event.queryStringParameters?.contentType;
    const contentType = requestedContentType && ALLOWED_CONTENT_TYPES.includes(requestedContentType)
      ? requestedContentType
      : "image/jpeg";

    const imageId = uuidv4();
    const imageKey = `muk-hunt/${sub}/${createdDate}_${fileName}`;
    console.log(`Getting muk hunt upload url for user ${sub}, key ${imageKey}`);

    // signing the content type means the browser PUT has to send exactly the same value back.
    const putObjectCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: imageKey,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(s3Client, putObjectCommand, { expiresIn: UPLOAD_URL_EXPIRY_SECONDS });
    const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${imageKey}`;

    await ddb.put({
      TableName: imageMetadataTableName,
      Item: {
        imageId: imageId,
        createdDate: createdDate,
        author: username,
        authorSub: sub,
        s3Url: s3Url,
        huntId: HUNT_ID,
        ttl: Math.floor(createdDate / 1000) + UNCLAIMED_IMAGE_TTL_SECONDS,
      },
    });

    return success({
      message: "Success.",
      imageId: imageId,
      uploadUrl: uploadUrl,
      imageUrl: s3Url,
      contentType: contentType,
    });
  } catch (err) {
    console.log(err);
    return fault({ message: err });
  }
}

/**
 * POST /games/mukhunt/submissions
 *
 * files an uploaded photo against a clue. Resubmitting replaces the photo and leaves points alone.
 */
async function submitPhotoActivity(event: APIGatewayProxyEventV2WithJWTAuthorizer, context: Context): Promise<APIGatewayProxyResultV2> {
  context.metrics.setProperty("RequestId", context.awsRequestId);
  const { username, sub } = getUserInfo(event);
  if (!event.body) { return error({ message: "Invalid Request: Missing post body." }); }
  const request = JSON.parse(event.body);
  if (!request.clueId || !request.imageId) {
    return error({ message: "Invalid Request: missing clueId or imageId." });
  }
  if (request.caption !== undefined && request.caption !== null && typeof request.caption !== "string") {
    return error({ message: "Invalid Request: caption must be text." });
  }

  // Captions are guest-written and end up concatenated into a public blog post, so they're flattened
  // to a single line and length-capped here. The album generator escapes markdown separately - this
  // stops junk at the door, that stops a caption from restructuring the post.
  // eslint-disable-next-line no-control-regex
  const caption = (request.caption ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (caption.length > MAX_CAPTION_LENGTH) {
    return error({ message: `Caption must be ${MAX_CAPTION_LENGTH} characters or fewer.` });
  }

  const submittedDate = Date.now();
  try {
    const hunt = await getHuntRecord();
    if (!hunt) {
      return error({ message: `No hunt record found for ${ENTITY_ID}.` });
    }
    if (!submissionsOpen(hunt, event, submittedDate)) {
      return error({ message: "Submissions are closed for this hunt." });
    }

    const clueResult = await ddb.get({
      TableName: tableName,
      Key: { entityId: ENTITY_ID, resourceId: clueResourceId(request.clueId) },
    });
    const clue = clueResult.Item;
    if (!clue || clue.deleted) {
      return error({ message: `No clue found with id "${request.clueId}".` });
    }

    const imageResult = await ddb.get({
      TableName: imageMetadataTableName,
      Key: { imageId: request.imageId },
    });
    const image = imageResult.Item;
    if (!image) {
      return error({ message: `No image found with id "${request.imageId}".` });
    }
    // without this, anyone could file someone else's upload as their own submission.
    if (image.authorSub !== sub) {
      return deny();
    }

    // claiming the image drops its ttl, so the record stops being a candidate for expiry.
    const { ttl, ...claimedImage } = image;
    await ddb.put({
      TableName: imageMetadataTableName,
      Item: {
        ...claimedImage,
        huntId: HUNT_ID,
        clueId: request.clueId,
        caption: caption,
        updatedDate: submittedDate,
      },
    });

    const existing = await ddb.get({
      TableName: tableName,
      Key: { entityId: sub, resourceId: submissionResourceId(request.clueId) },
    });

    const submission = {
      entityId: sub,
      resourceId: submissionResourceId(request.clueId),
      resourceType: "MukHuntSubmission",
      clueId: request.clueId,
      imageId: request.imageId,
      imageUrl: image.s3Url,
      caption: caption,
      // deliberately not named `points`: that's the pointsIndex sort key, and submissions have no
      // business showing up in an index meant for ranking players.
      pointsAwarded: clue.points,
      author: username,
      status: "ACCEPTED",
      submittedDate: existing.Item?.submittedDate ?? submittedDate,
      updatedDate: submittedDate,
    };
    // an unconditional put, which is what makes replacing a photo work.
    await ddb.put({ TableName: tableName, Item: submission });

    const totalPoints = await awardPoints(sub, username, request.clueId, clue.points, submittedDate);

    return success({
      message: "Success.",
      submission: submission,
      totalPoints: totalPoints,
    });
  } catch (err) {
    console.log(err);
    return fault({ message: err });
  }
}

/**
 * Adds a clue's points to a player's running total exactly once. Replacing a photo for a clue that
 * already scored is a no-op, which is what makes resubmission safe.
 */
async function awardPoints(sub: string, username: string, clueId: string, points: number, timestamp: number): Promise<number> {
  const resourceId = userPointsResourceId();
  const eventName = clueResourceId(clueId);

  const existing = await ddb.get({
    TableName: tableName,
    Key: { entityId: sub, resourceId: resourceId },
  });
  const record = existing.Item;

  if (record?.pointHistory?.find((entry: { event: string }) => entry.event === eventName)) {
    return record.points;
  }

  const totalPoints = (record?.points ?? 0) + points;
  await ddb.put({
    TableName: tableName,
    Item: {
      entityId: sub,
      resourceId: resourceId,
      resourceType: "MukHuntUserPoints",
      points: totalPoints,
      pointHistory: [
        ...(record?.pointHistory ?? []),
        { event: eventName, pointsAdded: points, points: totalPoints, timestamp: timestamp },
      ],
      author: username,
      lastUpdatedDate: timestamp,
    },
  });
  return totalPoints;
}

/**
 * GET /games/mukhunt/submissions
 *
 * a player's own submissions and running point total. Players only ever see their own.
 */
async function getMySubmissionsActivity(event: APIGatewayProxyEventV2WithJWTAuthorizer, context: Context): Promise<APIGatewayProxyResultV2> {
  context.metrics.setProperty("RequestId", context.awsRequestId);
  const { sub } = getUserInfo(event);
  try {
    const submissions = await ddb.query({
      TableName: tableName,
      KeyConditionExpression: "entityId = :entityId and begins_with(resourceId, :prefix)",
      ExpressionAttributeValues: {
        ':entityId': sub,
        ':prefix': `${ENTITY_ID}-Submission`,
      },
    });
    const points = await ddb.get({
      TableName: tableName,
      Key: { entityId: sub, resourceId: userPointsResourceId() },
    });
    return success({
      message: "Success.",
      submissions: submissions.Items ?? [],
      userPoints: points.Item ?? { points: 0, pointHistory: [] },
    });
  } catch (err) {
    console.log(err);
    return fault({ message: err });
  }
}

/**
 * GET /games/mukhunt/submissions/all
 *
 * every player's submissions, for building the photo album afterwards. Uses the resourceTypeIndex
 * rather than scanning, the same way survivor pulls everyone's entries for one prediction.
 */
async function getAllSubmissionsActivity(event: APIGatewayProxyEventV2WithJWTAuthorizer, context: Context): Promise<APIGatewayProxyResultV2> {
  context.metrics.setProperty("RequestId", context.awsRequestId);
  try {
    const result = await ddb.query({
      TableName: tableName,
      IndexName: "resourceTypeIndex",
      KeyConditionExpression: "resourceType = :resourceType and begins_with(resourceId, :prefix)",
      ExpressionAttributeValues: {
        ':resourceType': "MukHuntSubmission",
        ':prefix': `${ENTITY_ID}-Submission`,
      },
    });
    return success({
      message: "Success.",
      submissions: result.Items ?? [],
    });
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

export const getUploadUrl = middy(getUploadUrlActivity)
  .use(cloudwatchMetrics(getMetricsOptions("GetUploadUrl")));

export const submitPhoto = middy(submitPhotoActivity)
  .use(cloudwatchMetrics(getMetricsOptions("SubmitPhoto")));

export const getMySubmissions = middy(getMySubmissionsActivity)
  .use(cloudwatchMetrics(getMetricsOptions("GetMySubmissions")));

export const getAllSubmissions = middy(getAllSubmissionsActivity)
  .use(requireGroup("Admins"))
  .use(cloudwatchMetrics(getMetricsOptions("GetAllSubmissions")));
