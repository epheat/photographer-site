import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import middy from '@middy/core';
import cloudwatchMetrics, { Context } from '@middy/cloudwatch-metrics';
import { error, fault, success } from "./responses";

// The hunt currently being played. A future hunt is a new set of records in the table, plus a bump here.
export const HUNT_ID = "2027";
export const ENTITY_ID = `MukHunt-${HUNT_ID}`;

const tableName = process.env.gameDataTableName;
const ddbClient = new DynamoDBClient({ region: "us-east-1" });
const ddb = DynamoDBDocument.from(ddbClient);

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
