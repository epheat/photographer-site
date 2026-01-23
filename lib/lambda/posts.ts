import { APIGatewayProxyEventV2, APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { fault, success, error } from './responses';
import { v4 as uuidv4 } from "uuid";
import { getUserInfo } from "./auth";
import middy from '@middy/core';
import cloudwatchMetrics, { Context } from '@middy/cloudwatch-metrics';
import { requireGroup } from './middleware';

// TODO: environment variables for constants like table name
const tableName = "PSPosts";
const client = new DynamoDBClient([{ region: "us-east-1" }]);
// DynamoDB document client abstracts the mapping from ddb attributes into javascript objects.
// docs: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html
const ddb = DynamoDBDocument.from(client);

/**
 * GET /posts
 *
 * Returns latest 20 posts
 * Query params:
 *   - postType: post type filter (default: "TEXT", can also be "RECIPE")
 * TODO: pagination
 */
async function getPosts(event: APIGatewayProxyEventV2, context: Context): Promise<APIGatewayProxyResultV2> {
  context.metrics.setProperty("RequestId", context.awsRequestId);
  const postType = event.queryStringParameters?.postType ?? 'TEXT';

  // get the first 10 posts, sorted by timestamp by querying on the "postTypeTimeSorted" index.
  try {
    const results = await ddb.query({
      TableName: tableName,
      IndexName: "postTypeTimeSorted",
      KeyConditionExpression: "postType = :postType",
      ScanIndexForward: false,
      ExpressionAttributeValues: { ':postType': postType },
    });

    return success({
      message: "Success.",
      items: results.Items,
      lastEvaluatedKey: results.LastEvaluatedKey
    });
  } catch (err) {
    return fault({ message: err });
  }
}

/**
 * GET /posts/{postId}
 * 
 * Returns the post with postId={postId}
 */
async function getPost(event: APIGatewayProxyEventV2, context: Context): Promise<APIGatewayProxyResultV2> {
  context.metrics.setProperty("RequestId", context.awsRequestId);
  if (!event.pathParameters?.postId) {
    return error({ message: "Invalid Request: Missing postId path parameter." });
  }
  try {
    const result = await ddb.get({
      TableName: tableName,
      Key: { postId: event.pathParameters.postId }
    });

    if (!result.Item) {
      return error({ message: "Post does not exist." });
    }

    // Get previous/next posts of the same type for navigation
    const postType = result.Item.postType ?? 'TEXT';

    const previous = await ddb.query({
      TableName: tableName,
      IndexName: "postTypeTimeSorted",
      KeyConditionExpression: "postType = :postType and createdDate < :createdDate",
      ExpressionAttributeValues: { ':postType': postType, ':createdDate': result.Item.createdDate },
      ScanIndexForward: false,
      Limit: 1,
    });

    const next = await ddb.query({
      TableName: tableName,
      IndexName: "postTypeTimeSorted",
      KeyConditionExpression: "postType = :postType and createdDate > :createdDate",
      ExpressionAttributeValues: { ':postType': postType, ':createdDate': result.Item.createdDate },
      Limit: 1,
    });

    return success({
      message: "Success.",
      post: {
        ...result.Item,
        previous: previous.Items?.length === 1 ? previous.Items[0] : null,
        next: next.Items?.length === 1 ? next.Items[0] : null,
      },
    });
  } catch (err) {
    return fault({ message: err });
  }
}

/**
 * POST /posts/new
 *
 * Creates a new post or recipe.
 * For TEXT posts: requires title, content
 * For RECIPE posts: requires title, instructions, ingredients, recipeCategory
 */
async function putPost(event: APIGatewayProxyEventV2WithJWTAuthorizer, context: Context): Promise<APIGatewayProxyResultV2> {
  context.metrics.setProperty("RequestId", context.awsRequestId);
  if (!event.body) {
    return error({ message: "Invalid Request: Missing post body." });
  }
  const item = JSON.parse(event.body);
  const postType = item?.post?.postType ?? 'TEXT';

  // Validate based on post type
  if (postType === 'TEXT') {
    if (!item?.post?.title || !item?.post?.content) {
      return error({ message: "Invalid Request: title & content are required fields." });
    }
  } else if (postType === 'RECIPE') {
    if (!item?.post?.title || !item?.post?.instructions || !item?.post?.ingredients) {
      return error({ message: "Invalid Request: title, instructions & ingredients are required for recipes." });
    }
  } else {
    return error({ message: "Invalid Request: postType must be TEXT or RECIPE." });
  }

  const { username, sub } = getUserInfo(event);
  const id = uuidv4();
  const createdDate = Date.now();

  // Build the item based on post type
  const dbItem: Record<string, any> = {
    postId: id,
    postType: postType,
    createdDate: createdDate,
    author: username,
    authorSub: sub,
    title: item.post.title,
  };

  if (postType === 'TEXT') {
    dbItem.content = item.post.content;
  } else if (postType === 'RECIPE') {
    dbItem.instructions = item.post.instructions;
    dbItem.ingredients = item.post.ingredients;
    dbItem.recipeTags = item.post.recipeTags;
    dbItem.description = item.post.description;
    dbItem.pictureUrl = item.post.pictureUrl;
    dbItem.prepTime = item.post.prepTime;
    dbItem.cookTime = item.post.cookTime;
    dbItem.servings = item.post.servings;
  }

  try {
    const putResult = await ddb.put({
      TableName: tableName,
      Item: dbItem
    });
    return success({
      message: "Success.",
      postId: id,
      attributes: putResult.Attributes,
    });
  } catch (err) {
    return fault({ message: err });
  }
}

/**
 * POST /posts/{postId}
 *
 * Edits a post or recipe.
 */
async function editPost(event: APIGatewayProxyEventV2, context: Context): Promise<APIGatewayProxyResultV2> {
  context.metrics.setProperty("RequestId", context.awsRequestId);
  if (!event.body) {
    return error({ message: "Invalid Request: Missing post body." });
  }
  if (!event.pathParameters?.postId) {
    return error({ message: "Invalid Request: Missing postId path parameter." });
  }
  let item = JSON.parse(event.body);

  // get the existing post
  let postItem: any;
  try {
    const getResult = await ddb.get({
      TableName: tableName,
      Key: { postId: event.pathParameters.postId },
    });
    if (!getResult.Item) {
      return error({ message: `Invalid Request: post doesn't exist with postId ${event.pathParameters.postId}`})
    }
    postItem = getResult.Item;
  } catch (err) {
    return fault({ message: err })
  }

  const postType = postItem.postType ?? 'TEXT';

  // Validate based on post type
  if (postType === 'TEXT') {
    if (!item?.post?.title && !item?.post?.content) {
      return error({ message: "Invalid Request: either title or content is required to edit." });
    }
  }
  // For recipes, any field can be updated

  // update that post with new values from the request
  const editedDate = Date.now();
  const updatedItem: Record<string, any> = {
    ...postItem,
    title: item.post.title ?? postItem.title,
    editedDate: editedDate,
  };

  if (postType === 'TEXT') {
    updatedItem.content = item.post.content ?? postItem.content;
  } else if (postType === 'RECIPE') {
    updatedItem.instructions = item.post.instructions;
    updatedItem.ingredients = item.post.ingredients;
    updatedItem.recipeTags = item.post.recipeTags;
    updatedItem.description = item.post.description;
    updatedItem.pictureUrl = item.post.pictureUrl;
    updatedItem.prepTime = item.post.prepTime;
    updatedItem.cookTime = item.post.cookTime;
    updatedItem.servings = item.post.servings;
  }

  try {
    const putResult = await ddb.put({
      TableName: tableName,
      Item: updatedItem
    });
    return success({
      message: "Success.",
      attributes: putResult.Attributes,
    });
  } catch (err) {
    return fault({ message: err });
  }
}


/**
 * DELETE /posts/{postId}
 * 
 * Deletes a post.
 */
async function deletePost(event: APIGatewayProxyEventV2, context: Context): Promise<APIGatewayProxyResultV2> {
  context.metrics.setProperty("RequestId", context.awsRequestId);
  if (!event.pathParameters?.postId) {
    return error({ message: "Invalid Request: Missing postId path parameter." });
  }
  try {
    const deleteResult = await ddb.delete({
      TableName: tableName,
      Key: { postId: event.pathParameters.postId }
    });
    return success({
      message: "Success.",
      attributes: deleteResult.Attributes,
    });
  } catch (err) {
    return fault({ message: err })
  }
}

function getMetricsOptions(operation: string) {
  return {
    namespace: "PS-Posts-API",
    dimensions: [
      { "Operation": operation }
    ]
  }
}

export const getAll = middy(getPosts).use(cloudwatchMetrics(getMetricsOptions("GetAllPosts")));
export const get = middy(getPost).use(cloudwatchMetrics(getMetricsOptions("GetPost")));
export const put = middy(putPost).use(requireGroup("Admins")).use(cloudwatchMetrics(getMetricsOptions("PutPost")));
export const edit = middy(editPost).use(requireGroup("Admins")).use(cloudwatchMetrics(getMetricsOptions("EditPost")));
export const del = middy(deletePost).use(requireGroup("Admins")).use(cloudwatchMetrics(getMetricsOptions("DeletePost")));