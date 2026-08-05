import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import middy from '@middy/core';
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

// Clue ids are hand-written slugs rather than uuids, because they show up in the sort key of every
// submission and in every point history entry, where "lighthouse-selfie" beats a uuid when reading
// rows by hand. They're part of those keys, so a clue id is immutable once players start submitting.
const CLUE_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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
