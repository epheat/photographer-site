import middy from "@middy/core";
import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { userHasGroup } from "./auth";
import { deny } from "./responses";

/**
 * A middy middleware which requires the given group for access to the API.
 * If the calling user is not in the group, then an access denied error is returned.
 */
 export const requireGroup = (group: string): middy.MiddlewareObj<APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2> => {

  const before: middy.MiddlewareFn<APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2> = async (request): Promise<any> => {
      if (!userHasGroup(request.event, group)) {
          request.response = deny();
      }
  }

  return {
      before: before
  }
}
