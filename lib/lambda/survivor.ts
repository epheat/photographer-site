import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import {
    CognitoIdentityProviderClient,
    AdminGetUserCommand,
    UserStatusType
} from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyEventV2, APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { deny, error, fault, success } from "./responses";
import { getUserInfo, userHasGroup } from "./auth";
import { v4 as uuidv4 } from "uuid";
import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { Charset } from "aws-cdk-lib/aws-lambda-nodejs";

const tableName = process.env.gameDataTableName;
const client = new DynamoDBClient([{ region: "us-east-1" }]);
// DynamoDB document client abstracts the mapping from ddb attributes into javascript objects.
// docs: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html
const ddb = DynamoDBDocument.from(client);
const userPoolId = process.env.userPoolId;
const cognitoClient = new CognitoIdentityProviderClient([{ region: "us-east-1" }]);
const sesClient = new SESv2Client([{ region: "us-east-1" }]);

/**
 * GET games/survivor/cast
 *
 * returns the survivor cast for the current seasonId.
 */
export async function getCast(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const seasonId = await getActiveSeason();
    try {
        const results = await ddb.get({
            TableName: tableName,
            Key: { entityId: `FantasySurvivor-${seasonId}`, resourceId: "Cast" }
        });

        return success({
            message: "Success.",
            items: results.Item?.survivors,
        });
    } catch (err) {
        return fault({ message: err });
    }
}

/**
 * POST games/survivor/cast
 *
 * updates the survivor cast for the active season.
 */
export async function setCast(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
    if (!userHasGroup(event, "Admins")) {
        return deny();
    }
    if (!event.body) {
        return error({ message: "Invalid Request: Missing post body." });
    }
    const request = JSON.parse(event.body);
    if (!request?.survivors) {
        return error({ message: "Invalid Request: survivors is a required field." });
    }
    for (let survivor of request.survivors) {
        if (!isSurvivor(survivor)) {
            return error({ message: `Invalid Request: survivor ${survivor} does not match schema.` });
        }
    }
    const seasonId = await getActiveSeason();

    try {
        const result = await ddb.put({
            TableName: tableName,
            Item: {
                entityId: `FantasySurvivor-${seasonId}`,
                resourceId: "Cast",
                survivors: request.survivors,
                resourceType: "Cast"
            }
        });
        return success({
            message: "Success.",
            attributes: result.Attributes,
        })
    } catch (err) {
        return fault({ message: err });
    }
}

/**
 * GET /games/survivor/predictions
 *
 * get all game-predictions, sorted by most recent Episode
 */
export async function getPredictions(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const seasonId = await getActiveSeason();
    try {
        const results = await ddb.query({
            TableName: tableName,
            KeyConditionExpression: "entityId = :entityId and begins_with(resourceId, :resourceType)",
            ExpressionAttributeValues: { ':entityId': `FantasySurvivor-${seasonId}`, ':resourceType': 'Prediction' },
            ScanIndexForward: false,
        });

        return success({
            message: "Success.",
            items: results.Items,
        });
    } catch (err) {
        return fault({ message: err });
    }
}

/**
 * POST /games/survivor/predictions
 *
 * edit or put a new game-prediction
 */
export async function setPrediction(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
    if (!userHasGroup(event, "Admins")) { return deny(); }
    if (!event.body) { return error({ message: "Invalid Request: Missing post body." }); }
    const request = JSON.parse(event.body);
    if (!request?.prediction || !request?.prediction?.episode || !request?.prediction?.predictionType || !request?.prediction?.reward || !request?.prediction?.select || !request?.prediction?.predictBefore || !request?.prediction?.options) {
        return error({ message: "Invalid Request: missing required fields." });
    }
    const seasonId = await getActiveSeason();

    try {
        const result = await ddb.put({
            TableName: tableName,
            Item: {
                entityId: `FantasySurvivor-${seasonId}`,
                resourceId: `Prediction-${request.prediction.episode}-${request.prediction.predictionType}`,
                episode: request.prediction.episode,
                reward: request.prediction.reward,
                predictBefore: request.prediction.predictBefore,
                select: request.prediction.select,
                predictionType: request.prediction.predictionType,
                options: request.prediction.options,
                resourceType: "Prediction",
                lastUpdatedDate: new Date().getTime(),
            }
        });
        return success({
            message: "Success.",
            attributes: result.Attributes,
        })
    } catch (err) {
        return fault({ message: err });
    }
}

/**
 * POST /games/survivor/predictions/delete
 *
 * deletes a prediction. Revokes
 */
export async function deletePrediction(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
    if (!userHasGroup(event, "Admins")) { return deny(); }
    if (!event.body) { return error({ message: "Invalid Request: Missing body." }); }
    const request = JSON.parse(event.body);
    if (!request?.prediction || !request?.prediction?.episode || !request?.prediction?.predictionType || !request?.revokePoints) {
        return error({ message: "Invalid Request: missing required fields." });
    }
    const seasonId = await getActiveSeason();
    const resourceId = `FantasySurvivor-${seasonId}-UserPrediction-${request.prediction.episode}-${request.prediction.predictionType}`;
    if (request.revokePoints) {
        try {
            const userPoints = await ddb.query({
                TableName: tableName,
                IndexName: "pointsIndex",
                KeyConditionExpression: "resourceId = :resourceId",
                ExpressionAttributeValues: {
                    ':resourceId': `FantasySurvivor-${seasonId}-UserPoints`,
                },
            });
            // for each userPoints record
            for (const userPointsRecord of userPoints.Items || []) {
                // if the user has points for this prediction being deleted
                const historyEvent = userPointsRecord.pointHistory.find((item: { event: string; }) => item.event === resourceId);
                if (historyEvent) {
                    // then remove them (put back the points record with points subtracted)
                    await ddb.put({
                        TableName: tableName,
                        Item: {
                            ...userPointsRecord,
                            points: userPointsRecord.points - historyEvent.pointsAdded,
                            pointHistory: userPointsRecord.pointHistory.filter((item: { event: string; }) => item.event !== resourceId),
                            placementHistory: userPointsRecord.placementHistory.filter((item: { event: string; }) => item.event !== resourceId),
                        }
                    })
                }
            }
            const userPredictions = await ddb.query({
                TableName: tableName,
                IndexName: "resourceTypeIndex",
                KeyConditionExpression: "resourceType = :resourceType and resourceId = :resourceId",
                ExpressionAttributeValues: {
                    ':resourceType': 'UserPrediction',
                    ':resourceId': resourceId,
                },
            });
            // delete each userPrediction record.
            for (const userPredictionRecord of userPredictions.Items || []) {
                await ddb.delete({
                    TableName: tableName,
                    Key: {
                        entityId: userPredictionRecord.entityId,
                        resourceId: userPredictionRecord.resourceId,
                    }
                })
            }
        } catch (err) {
            return fault({ message: err });
        }
    }

    try {
        const result = await ddb.delete({
            TableName: tableName,
            Key: {
                entityId: `FantasySurvivor-${seasonId}`,
                resourceId: `Prediction-${request.prediction.episode}-${request.prediction.predictionType}`,
            }
        });
        return success({
            message: "Success.",
            attributes: result.Attributes,
        })
    } catch (err) {
        return fault({ message: err });
    }
}

/**
 * GET /games/survivor/userPredictions
 *
 * get all userPredictions
 */
export async function getUserPredictions(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const seasonId = await getActiveSeason();
    try {
        const results = await ddb.query({
            TableName: tableName,
            IndexName: "resourceTypeIndex",
            KeyConditionExpression: "resourceType = :resourceType and begins_with(resourceId, :resourceId)",
            ExpressionAttributeValues: { ':resourceType': "UserPrediction", ':resourceId': `FantasySurvivor-${seasonId}` },
        });
        return success({
            message: "Success.",
            items: results.Items,
        });
    } catch (err) {
        return fault({ message: err });
    }
}

/**
 * GET /games/survivor/userPrediction/{sub}
 *
 * get a specific user's userPredictions
 */
export async function getUserPrediction(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    if (!event.pathParameters?.sub) {
        return error({ message: "Invalid Request: Missing sub path parameter." });
    }
    const seasonId = await getActiveSeason();
    try {
        const results = await ddb.query({
            TableName: tableName,
            KeyConditionExpression: "entityId = :entityId and begins_with(resourceId, :resourceType)",
            ExpressionAttributeValues: { ':entityId': event.pathParameters?.sub, ':resourceType': `FantasySurvivor-${seasonId}-UserPrediction` },
        });
        return success({
            message: "Success.",
            items: results.Items,
        });
    } catch (err) {
        return fault({ message: err });
    }
}


/**
 * POST /games/survivor/userPredictions
 *
 * submit/edit your user prediction
 */
export async function setUserPrediction(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
    const { username, sub } = getUserInfo(event);
    if (!event.body) { return error({ message: "Invalid Request: Missing post body." }); }
    const request = JSON.parse(event.body);
    console.log(`setUserPrediction request for user ${username} - ${event.body}`);
    if (!request?.userPrediction || !request?.userPrediction?.episode || !request?.userPrediction?.predictionType || !request?.userPrediction?.selections) {
        return error({ message: "Invalid Request: missing required fields." });
    }
    const requestTime = new Date().getTime();
    const seasonId = await getActiveSeason();
    let inventory = undefined;
    let multiplier = 1.0;
    let usedItem = false;
    // based on the request episode+predictionType, fetch the prediction from game data. We need to make sure the
    // prediction is still ongoing, and the user's selections are even eligible for the prediction
    try {
        const result = await ddb.get({
            TableName: tableName,
            Key: {
                entityId: `FantasySurvivor-${seasonId}`,
                resourceId: `Prediction-${request.userPrediction.episode}-${request.userPrediction.predictionType}`
            }
        });
        if (!result.Item) {
            return error({ message: "Invalid Request: prediction does not exist." });
        }
        if (requestTime > result.Item.predictBefore) {
            return error({ message: "Invalid Request: prediction window has ended." });
        }
        if (!optionsContainSelections(result.Item.options, request.userPrediction.selections)) {
            return error({ message: "Invalid Request: user prediction contained invalid survivor ids for this prediction." });
        }
        let maxSelections = result.Item.select;
        // check for advantages -- if an id is specified, grab it from the user inventory and apply it.
        if (request.userPrediction.item) {
            const userInventory = await ddb.get({
                TableName: tableName,
                Key: {
                    entityId: sub,
                    resourceId: `FantasySurvivor-${seasonId}-UserInventory`
                }
            });
            inventory = userInventory.Item?.items ?? [];
            const itemIndex = inventory.findIndex((item: { id: string; }) => item.id === request.userPrediction.item);
            if (itemIndex != -1) {
                if (result.Item.options.length < 8) {
                    return error({ message: "Invalid Request: advantage cannot be used with less than 8 survivors." });
                }
                if (result.Item.predictionType === "Finalist") {
                    return error({ message: "Invalid Request: advantage cannot be used for Finalist predictions." });
                }
                // if the item was found in the user's inventory, remove it from the inventory and apply its effects.
                if (inventory[itemIndex].itemType === "ExtraVoteAdvantage") {
                    maxSelections += inventory[itemIndex].extraVotes;
                } else if (inventory[itemIndex].itemType === "PointMultiplierAdvantage") {
                    multiplier = inventory[itemIndex].multiplier;
                }
                inventory.splice(itemIndex, 1);
                usedItem = true;
            } else {
                return error({ message: "Invalid Request: tried to use invalid item." });
            }
        }

        if (request.userPrediction.selections.length > maxSelections) {
            return error({ message: "Invalid Request: too many selections." });
        }
    } catch (err) {
        console.log(err);
        return fault({ message: err });
    }

    // insert the userPrediction record
    try {
        const result = await ddb.put({
            TableName: tableName,
            Item: {
                entityId: sub,
                resourceId: `FantasySurvivor-${seasonId}-UserPrediction-${request.userPrediction.episode}-${request.userPrediction.predictionType}`,
                predictionId: `Prediction-${request.userPrediction.episode}-${request.userPrediction.predictionType}`,
                episode: request.userPrediction.episode,
                predictionType: request.userPrediction.predictionType,
                selections: request.userPrediction.selections,
                multiplier: multiplier,
                resourceType: "UserPrediction",
                lastUpdatedDate: requestTime,
                username: username,
            }
        });

        // if the user used an advantage as part of this request, commit that change back to the inventory.
        if (usedItem) {
            await ddb.put({
                TableName: tableName,
                Item: {
                    entityId: sub,
                    resourceId: `FantasySurvivor-${seasonId}-UserInventory`,
                    items: inventory,
                    lastUpdatedDate: requestTime,
                }
            })
        }
        return success({
            message: "Success.",
            attributes: result.Attributes,
        })
    } catch (err) {
        console.log(err);
        return fault({ message: err });
    }
}

/**
 * POST /games/survivor/predictions/complete
 *
 * complete a prediction by providing the results, awarding points to users.
 */
export async function completePrediction(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
    if (!userHasGroup(event, "Admins")) { return deny(); }
    if (!event.body) { return error({ message: "Invalid Request: Missing body." }); }
    const request = JSON.parse(event.body);
    console.log(`completePrediction request - ${event.body}`);
    if (!request?.prediction || !request?.prediction?.episode || !request?.prediction?.predictionType || !request?.prediction?.selections) {
        return error({ message: "Invalid Request: missing required fields." });
    }
    const requestTime = new Date().getTime();
    const seasonId = await getActiveSeason();
    // first, fetch the prediction record and make sure the prediction window has ended, and the results match the prediction options
    let prediction;
    try {
        const result = await ddb.get({
            TableName: tableName,
            Key: {
                entityId: `FantasySurvivor-${seasonId}`,
                resourceId: `Prediction-${request.prediction.episode}-${request.prediction.predictionType}`,
            }
        });
        if (!result.Item) {
            return error({ message: "Invalid Request: prediction does not exist." });
        }
        if (requestTime < result.Item.predictBefore) {
            return error({ message: "Invalid Request: prediction cannot be completed because the prediction window hasn't ended." });
        }
        if (!optionsContainSelections(result.Item.options, request.prediction.selections)) {
            return error({ message: "Invalid Request: input prediction completion selections contained invalid survivor ids for this prediction." });
        }
        if (result.Item.results) {
            return error({ message: "Invalid Request: prediction has already been completed."})
        }
        prediction = result.Item;
    } catch (err) {
        console.log(err);
        return fault({ message: err });
    }
    // for each user-prediction record for this resourceId, match the user selections with the prediction results to compute points
    const userPoints: { userSub: string; username: string; pointsToAward: number; points: number; }[] = [];
    const resourceId = `FantasySurvivor-${seasonId}-UserPrediction-${request.prediction.episode}-${request.prediction.predictionType}`;
    try {
        const results = await ddb.query({
            TableName: tableName,
            IndexName: "resourceTypeIndex",
            KeyConditionExpression: "resourceType = :resourceType and resourceId = :resourceId",
            ExpressionAttributeValues: {
                ':resourceType': 'UserPrediction',
                ':resourceId': resourceId,
            },
        });
        for (const userPrediction of results.Items || []) {
            const pointsToAward = calculatePoints(request.prediction.selections, prediction.reward, userPrediction);
            userPoints.push({
                userSub: userPrediction.entityId,
                username: userPrediction.username,
                pointsToAward: pointsToAward,
                points: pointsToAward,
            });
        }
    } catch (err) {
        console.log(err);
        return fault({ message: err });
    }
    // award points to each user, mark the user-points record as having been updated for the completed predictionId
    try {
        // get all existing user points records in descending order
        const queryResult = await ddb.query({
            TableName: tableName,
            IndexName: "pointsIndex",
            KeyConditionExpression: "resourceId = :resourceId",
            ExpressionAttributeValues: {
                ':resourceId': `FantasySurvivor-${seasonId}-UserPoints`
            },
            ScanIndexForward: false,
        });
        // fill in existing points records that didn't make predictions this round
        const pointsRecordsButNotThisRound = queryResult.Items?.filter(item => {
            return userPoints.find(up => up.userSub === item.entityId) === undefined
        }) || [];
        pointsRecordsButNotThisRound.forEach(pt => {
            userPoints.push({
                userSub: pt.entityId,
                username: pt.username,
                pointsToAward: 0,
                points: pt.points,
            });
        })

        // loop to calculate placements
        for (const point of userPoints) {
            const existingPointRecord = queryResult.Items?.find(entry => entry.entityId === point.userSub)
            if (existingPointRecord) {
                point.points = existingPointRecord.points + point.pointsToAward;
            } // else it is the default of pointsToAward
        }
        userPoints.sort((p1, p2) => p2.points - p1.points);
        console.log(userPoints);

        // loop to write back points records
        let previousPoints = undefined;
        let previousPlacement = 1;
        for (let i = 0; i < userPoints.length; i++) {
            const { userSub, pointsToAward, username, points } = userPoints[i];
            const existingPointRecord = queryResult.Items?.find(entry => entry.entityId === userSub)
            let placement = i + 1;
            if (points === previousPoints) {
                placement = previousPlacement;
            } else {
                previousPlacement = placement;
                previousPoints = points;
            }
            let userPointsRecord;
            if (!existingPointRecord) {
                // if this user has no points, create a fresh record.
                userPointsRecord = {
                    entityId: userSub,
                    resourceId: `FantasySurvivor-${seasonId}-UserPoints`,
                    pointHistory: [
                        { event: resourceId, pointsAdded: pointsToAward, points: pointsToAward, timestamp: requestTime }
                    ],
                    placementHistory: [
                        { event: resourceId, placement: placement, timestamp: requestTime }
                    ],
                    resourceType: "UserPoints",
                    points: pointsToAward,
                    placement: placement,
                    lastUpdatedDate: requestTime,
                    username: username,
                }
            } else {
                // otherwise, fill from the existing record with some edits
                // if points were already awarded for this event, skip (idempotency)
                if (existingPointRecord.pointHistory.find((thing: { event: string; }) => thing.event === resourceId)) {
                    userPointsRecord = existingPointRecord;
                } else {
                    userPointsRecord = {
                        ...existingPointRecord,
                        pointHistory: [
                            ...existingPointRecord.pointHistory,
                            { event: resourceId, pointsAdded: pointsToAward, points: points, timestamp: requestTime }
                        ],
                        placementHistory: [
                            ...existingPointRecord.placementHistory,
                            { event: resourceId, placement: placement, timestamp: requestTime }
                        ],
                        points: points,
                        placement: placement,
                        lastUpdatedDate: requestTime
                    }
                }
            }
            console.log(`Adding ${pointsToAward} points for userSub ${userSub}, from prediction ${resourceId}.`);
            const putResult = await ddb.put({
                TableName: tableName,
                Item: userPointsRecord,
            });
        }
    } catch (err) {
        console.log(err);
        return fault({ message: err });
    }
    // finally, once all user-prediction records are covered, mark the game-prediction record as completed
    try {
        const result = await ddb.put({
            TableName: tableName,
            Item: {
                ...prediction,
                results: request.prediction.selections,
                lastUpdatedDate: requestTime,
            }
        });
    } catch (err) {
        console.log(err);
        return fault({ message: err });
    }
    return success({ message: "Success." });
}

/**
 * GET /games/survivor/leaderboard
 *
 * get points for all users, to populate the leaderboard.
 */
export async function getLeaderboard(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const seasonId = await getActiveSeason();
    try {
        const result = await ddb.query({
            TableName: tableName,
            IndexName: "pointsIndex",
            KeyConditionExpression: "resourceId = :resourceId",
            ExpressionAttributeValues: {
                ':resourceId': `FantasySurvivor-${seasonId}-UserPoints`
            },
            ScanIndexForward: false,
        });
        return success({
            message: "Success.",
            items: result.Items,
        })
    } catch (err) {
        console.log(err);
        return fault({ message: err });
    }
}

/**
 * GET /games/survivor/userInventory/:sub
 *
 * get a specific user's inventory
 */
export async function getUserInventory(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    if (!event.pathParameters?.sub) {
        return error({ message: "Invalid Request: Missing sub path parameter." });
    }
    const seasonId = await getActiveSeason();
    try {
        const results = await ddb.get({
            TableName: tableName,
            Key: {
                entityId: event.pathParameters?.sub,
                resourceId: `FantasySurvivor-${seasonId}-UserInventory`
            }
        });
        return success({
            message: "Success.",
            item: results.Item,
        });
    } catch (err) {
        return fault({ message: err });
    }
}

export async function getAllInventories(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
    if (!userHasGroup(event, "Admins")) { return deny(); }
    const seasonId = await getActiveSeason();
    try {
        const results = await ddb.query({
            TableName: tableName,
            IndexName: "resourceTypeIndex",
            KeyConditionExpression: "resourceType = :resourceType and begins_with(resourceId, :resourceId)",
            ExpressionAttributeValues: { ':resourceType': "UserInventory", ':resourceId': `FantasySurvivor-${seasonId}` },
        });
        return success({
            message: "Success.",
            items: results.Items,
        });
    } catch (err) {
        return fault({ message: err });
    }
}

/**
 * POST /games/survivor/items/:sub
 *
 * update a user's inventory
 */
export async function putItem(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
    if (!event.pathParameters?.sub) {
        return error({ message: "Invalid Request: Missing sub path parameter." });
    }
    if (!userHasGroup(event, "Admins")) { return deny(); }
    if (!event.body) { return error({ message: "Invalid Request: Missing body." }); }
    const request = JSON.parse(event.body);
    console.log(`putItem request - ${event.body}`);
    console.log(`userSub: ${event.pathParameters.sub}`);
    if (!request?.item || !isValidItem(request.item)) {
        return error({ message: "Invalid Request: missing required fields." });
    }
    const requestTime = new Date().getTime();
    const seasonId = await getActiveSeason();
    try {
        const getResult = await ddb.get({
            TableName: tableName,
            Key: {
                entityId: event.pathParameters?.sub,
                resourceId: `FantasySurvivor-${seasonId}-UserInventory`
            }
        });
        let inventory = getResult.Item ?? {
            entityId: event.pathParameters.sub,
            resourceId: `FantasySurvivor-${seasonId}-UserInventory`,
            resourceType: "UserInventory",
            items: []
        }
        inventory.lastUpdatedDate = requestTime;
        inventory.items.push({
            id: uuidv4(),
            lastUpdatedDate: requestTime,
            ...request.item,
        });

        await ddb.put({
            TableName: tableName,
            Item: {
                ...inventory,
                resourceType: "UserInventory",
            }
        })
    } catch (err) {
        console.log(err);
        return fault({ message: err });
    }
    return success({ message: "Success." });
}

/**
 * Lambda sendPredictionReminders
 *
 * When a prediction is created, a State Machine will be spun up which will invoke this Lambda 24h before the prediction
 * window closes. This will email all players who haven't submitted userPredictions yet.
 */
export async function sendPredictionReminders(predictionId: string): Promise<void> {
    const seasonId = await getActiveSeason();
    console.log(`Sending reminder for prediction ${predictionId}`);
    // get season leaderboard to fetch all users who have participated this season, then filter down to only those who
    // have not submitted a prediction yet.
    const userPoints = await ddb.query({
        TableName: tableName,
        IndexName: "pointsIndex",
        KeyConditionExpression: "resourceId = :resourceId",
        ExpressionAttributeValues: {
            ':resourceId': `FantasySurvivor-${seasonId}-UserPoints`
        }
    });
    const userPredictions = await ddb.query({
        TableName: tableName,
        IndexName: "resourceTypeIndex",
        KeyConditionExpression: "resourceType = :resourceType and resourceId = :resourceId",
        ExpressionAttributeValues: {
            ':resourceType': 'UserPrediction',
            ':resourceId': predictionId,
        },
    });
    let userPointsWithUsername = (userPoints.Items ?? []).map(item => { return {
        entityId: item.entityId,
        username: item.username,
    }});
    // start with all userPoints, removing those that are present in userPredictions
    let usernamesWithoutPrediction: string[] = userPointsWithUsername.filter(item => {
        return !userPredictions.Items?.find(userPrediction => userPrediction.entityId == item.entityId);
    }).map(item => {
        return item.username;
    });

    const emailAddresses: string[] = [];
    for (const username of usernamesWithoutPrediction) {
        const user = await cognitoClient.send(new AdminGetUserCommand({
            UserPoolId: userPoolId,
            Username: username,
        }));

        if (user.UserStatus !== UserStatusType.CONFIRMED) {
            console.log(`User is not confirmed: ${username}`);
            continue;
        }

        const email = user.UserAttributes?.find(attribute => attribute.Name == "email")?.Value;
        if (email == undefined) {
            console.log(`Couldn't find email property for user ${username}`);
            continue;
        }

        emailAddresses.push(email);
    }

    const sesResult = await sesClient.send(new SendEmailCommand({
        FromEmailAddress: "noreply@noreply.evanheaton.com",
        Destination: {
            ToAddresses: emailAddresses,
        },
        Content: {
            Simple: {
                Subject: {
                    Data: "FantasySurvivor: Submit your predictions!",
                },
                Body: {
                    Text: {
                        Data: "Time is running out! Follow the link below to submit your predictions in FantasySurvivor!\n\nhttps://evanheaton.com/games/FantasySurvivor\n\n- Evan",
                    }
                }
            }
        }
    }));

    return;
}

function isValidItem(item: any): boolean {
    // add any new item types here
    if (item.itemType === "ExtraVoteAdvantage") {
        return item.extraVotes;
    } else if (item.itemType === "PointMultiplierAdvantage") {
        return item.multiplier;
    } else {
        return false;
    }
}

function calculatePoints(resultSelections: any, reward: number, userPrediction: any) {
    let pointsToAward = 0;
    for (const id of resultSelections) {
        for (const userSelectionId of userPrediction.selections) {
            if (userSelectionId === id) {
                pointsToAward += Math.round(reward * (userPrediction.multiplier ?? 1.0));
            }
        }
    }
    return pointsToAward;
}

function optionsContainSelections(options: string[], selections: string[]) {
    for (let id of selections) {
        if (!options.includes(id)) {
            return false;
        }
    }
    return true;
}

export interface Survivor {
    name: string,
    age: number,
    hometown: string,
    occupation: string,
    votedOut?: string,
    challengesWon?: ChallengeVictory[]
}

export interface ChallengeVictory {
    challengeType: string, // REWARD, IMMUNITY
    episode: string, // E01, E02, ...
    immunityType: string, // INDIVIDUAL, TRIBAL
}

function isSurvivor(s: any): s is Survivor {
    if (s.name !== undefined && typeof s.name === 'string' &&
        s.age !== undefined && typeof s.age === 'number' &&
        s.hometown !== undefined && typeof s.hometown === 'string' &&
        s.occupation !== undefined && typeof s.occupation === 'string') {
        return true;
    } else {
        return false;
    }
}

/**
 * Get the current active season.
 *
 * TODO: make season a parameter in API calls, instead of always defaulting to the active one.
 */
async function getActiveSeason(): Promise<String> {
    try {
        const results = await ddb.query({
            TableName: tableName,
            KeyConditionExpression: "entityId = :entityId",
            ExpressionAttributeValues: { ':entityId': 'FantasySurvivor-Season'},
        });
        if (!results.Items) {
            console.log("No items found for FantasySurvivor-Season. Returning default S43.");
            return "S43";
        }
        return results.Items.filter(item => item.active)[0].resourceId;
    } catch (err) {
        console.log("Error getting active season. Returning default S43.", err);
        return "S43";
    }
}
