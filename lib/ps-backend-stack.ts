import {
  aws_certificatemanager as acm,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_s3 as s3,
  aws_apigatewayv2 as apigateway,
  aws_apigatewayv2_integrations as integrations,
  aws_apigatewayv2_authorizers as authorizers,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";
import { PSAuth } from "./constructs/ps-auth";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";

export interface PSBackendStackProps extends StackProps {
  domain: String,
}

export class PSBackendStack extends Stack {
  constructor(scope: Construct, id: string, props: PSBackendStackProps) {
    super(scope, id, props);

    // Website hosted at evanheaton.com
    const apiHostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'hostedZone', {
      hostedZoneId: 'Z00027603FLKG9A9ZISEJ',
      zoneName: 'api.evanheaton.com',
    });

    // DynamoDB Storage
    // Users, Posts, Albums tables
    const postsTable = new dynamodb.Table(this, 'posts-table', {
      tableName: "PSPosts",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: 'postId', type: dynamodb.AttributeType.STRING },
      pointInTimeRecovery: true
    });
    postsTable.addGlobalSecondaryIndex({
      indexName: 'postTypeTimeSorted',
      partitionKey: { name: 'postType', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdDate', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const gameDataTable = new dynamodb.Table(this, 'game-data-table', {
      tableName: "PSGameData",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: 'entityId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'resourceId', type: dynamodb.AttributeType.STRING },
      pointInTimeRecovery: true,
    });
    gameDataTable.addGlobalSecondaryIndex({
      indexName: 'resourceTypeIndex',
      partitionKey: { name: 'resourceType', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'resourceId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    gameDataTable.addGlobalSecondaryIndex({
      indexName: 'pointsIndex',
      partitionKey: { name: 'resourceId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'points', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const imageMetadataTable = new dynamodb.Table(this, 'image-metadata-table', {
      tableName: `${props.domain}-EHImageMetadata`,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: 'imageId', type: dynamodb.AttributeType.STRING },
      pointInTimeRecovery: true,
    });
    // TODO: GSIs for image metadata

    // S3 Storage
    const staticDataBucket = new s3.Bucket(this, 'eh-website-static-data', {
      bucketName: `${props.domain.toLowerCase()}-eh-website-static-data`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    staticDataBucket.addCorsRule({
      allowedMethods: [
        s3.HttpMethods.GET,
        s3.HttpMethods.HEAD,
        s3.HttpMethods.PUT,
      ],
      allowedOrigins: [ "*" ], // TODO: better cors
      allowedHeaders: [ "*" ],
      exposedHeaders: [],
    });
    staticDataBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: "AllowPublicAccessForImagesPath",
      effect: iam.Effect.ALLOW,
      principals: [ new iam.AnyPrincipal() ],
      actions: [ 's3:GetObject' ],
      resources: [ `${staticDataBucket.bucketArn}/images/*` ]
    }));

    // AuthN
    // a cognito userpool for vending JWTs, and associated IAM roles
    const auth = new PSAuth(this, 'ps-auth');

    // Lambda functions
    const getPostsLambda = new nodejs.NodejsFunction(this, 'get-posts-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/posts.ts"),
      handler: 'getAll',
    });
    postsTable.grantReadData(getPostsLambda);
    const getPostLambda = new nodejs.NodejsFunction(this, 'get-post-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/posts.ts"),
      handler: 'get',
    });
    postsTable.grantReadData(getPostLambda);

    const createPostLambda = new nodejs.NodejsFunction(this, 'put-post-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/posts.ts"),
      handler: 'put',
    });
    postsTable.grantReadWriteData(createPostLambda);

    // survivor functions
    const getCastLambda = new nodejs.NodejsFunction(this, 'get-cast-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/survivor.ts"),
      handler: 'getCast',
    });
    gameDataTable.grantReadData(getCastLambda);
    const setCastLambda = new nodejs.NodejsFunction(this, 'set-cast-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/survivor.ts"),
      handler: 'setCast',
    });
    gameDataTable.grantReadWriteData(setCastLambda);

    const getPredictionsLambda = new nodejs.NodejsFunction(this, 'get-predictions-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/survivor.ts"),
      handler: 'getPredictions',
    });
    gameDataTable.grantReadData(getPredictionsLambda);
    const setPredictionLambda = new nodejs.NodejsFunction(this, 'set-prediction-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/survivor.ts"),
      handler: 'setPrediction',
    });
    gameDataTable.grantReadWriteData(setPredictionLambda);
    const deletePredictionLambda = new nodejs.NodejsFunction(this, 'del-prediction-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/survivor.ts"),
      handler: 'deletePrediction',
    });
    gameDataTable.grantReadWriteData(deletePredictionLambda);
    const getUserPredictionsLambda = new nodejs.NodejsFunction(this, 'get-user-predictions-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/survivor.ts"),
      handler: 'getUserPredictions',
    });
    gameDataTable.grantReadData(getUserPredictionsLambda);
    const getUserPredictionLambda = new nodejs.NodejsFunction(this, 'get-user-prediction-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/survivor.ts"),
      handler: 'getUserPrediction',
    });
    gameDataTable.grantReadData(getUserPredictionLambda);
    const setUserPredictionLambda = new nodejs.NodejsFunction(this, 'set-user-prediction-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/survivor.ts"),
      handler: 'setUserPrediction',
    });
    gameDataTable.grantReadWriteData(setUserPredictionLambda);
    const completePredictionLambda = new nodejs.NodejsFunction(this, 'complete-prediction-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/survivor.ts"),
      handler: 'completePrediction',
      timeout: Duration.seconds(10), // it can take a while to loop through all the players.
    });
    gameDataTable.grantReadWriteData(completePredictionLambda);
    const getLeaderboardLambda = new nodejs.NodejsFunction(this, 'get-leaderboard-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/survivor.ts"),
      handler: 'getLeaderboard',
    });
    gameDataTable.grantReadData(getLeaderboardLambda);
    const getUserInventoryLambda = new nodejs.NodejsFunction(this, 'get-user-inventory-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/survivor.ts"),
      handler: 'getUserInventory',
    });
    gameDataTable.grantReadData(getUserInventoryLambda);
    const getAllUserInventoriesLambda = new nodejs.NodejsFunction(this, 'get-all-user-inventories-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/survivor.ts"),
      handler: 'getAllInventories',
    });
    gameDataTable.grantReadData(getAllUserInventoriesLambda);
    const putItemLambda = new nodejs.NodejsFunction(this, 'put-item-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/survivor.ts"),
      handler: 'putItem',
    });
    gameDataTable.grantReadWriteData(putItemLambda);
    const sendPredictionRemindersLambda = new nodejs.NodejsFunction(this, 'send-prediction-reminders-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/survivor.ts"),
      handler: 'sendPredictionReminders',
    });
    gameDataTable.grantReadData(sendPredictionRemindersLambda);
    auth.userPool.grant(sendPredictionRemindersLambda, "cognito-idp:AdminGetUser");
    sendPredictionRemindersLambda.role?.addToPrincipalPolicy(new PolicyStatement({
      actions: ["ses:SendEmail"],
      resources: ["*"],
      effect: Effect.ALLOW,
    }));

    // images functions
    const getImageUploadUrl = new nodejs.NodejsFunction(this, 'get-image-upload-url-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/images.ts"),
      handler: 'getUploadUrl',
      environment: {
        imageDataBucketName: staticDataBucket.bucketName,
        imageMetadataTableName: imageMetadataTable.tableName,
      }
    });
    imageMetadataTable.grantReadWriteData(getImageUploadUrl);
    staticDataBucket.grantReadWrite(getImageUploadUrl);
    const putImageMetadata = new nodejs.NodejsFunction(this, 'put-image-metadata-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/images.ts"),
      handler: 'putImageMetadata',
      environment: {
        imageDataBucketName: staticDataBucket.bucketName,
        imageMetadataTableName: imageMetadataTable.tableName,
      }
    });
    imageMetadataTable.grantReadWriteData(putImageMetadata);
    const getAllImagesMetadata = new nodejs.NodejsFunction(this, 'get-all-images-metadata-func', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, "./lambda/images.ts"),
      handler: 'getAllImages',
      environment: {
        imageDataBucketName: staticDataBucket.bucketName,
        imageMetadataTableName: imageMetadataTable.tableName,
      }
    });
    imageMetadataTable.grantReadWriteData(getAllImagesMetadata);

    // api domain validations and certificate
    const apiUrl = `${props.domain.toLowerCase()}.${apiHostedZone.zoneName}`
    const hostedZone = new route53.HostedZone(this, 'hosted-zone', {
      zoneName: apiUrl,
    });
    const delegation = new route53.ZoneDelegationRecord(this, 'delegation', {
      zone: apiHostedZone,
      recordName: apiUrl,
      nameServers: hostedZone.hostedZoneNameServers!,
    });
    const certificate = new acm.Certificate(this, 'certificate', {
      domainName: apiUrl,
      subjectAlternativeNames: [`*.${apiUrl}`], // also reserve all subdomains
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });
    const domainName = new apigateway.DomainName(this, 'api-domain', {
      domainName: apiUrl,
      certificate: certificate,
    });
    const aliasRecord = new route53.ARecord(this, 'api-alias', {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new targets.ApiGatewayv2DomainProperties(domainName.regionalDomainName,domainName.regionalHostedZoneId))
    });

    // APIG HTTP API
    // for setting up API routes to Lambdas
    const httpApi = new apigateway.HttpApi(this, 'ps-posts-api', {
      description: 'photographer-website API routes',
      apiName: `ps-posts-api-${props.domain}`,
      corsPreflight: {
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
        ],
        allowMethods: [
          apigateway.CorsHttpMethod.OPTIONS,
          apigateway.CorsHttpMethod.GET,
          apigateway.CorsHttpMethod.POST,
        ],
        allowOrigins: ['*'],
      },
      defaultDomainMapping: {
        domainName: domainName,
      }
    });

    const authorizer = new authorizers.HttpUserPoolAuthorizer('userpool-authorizer', auth.userPool, {
      userPoolClients: [auth.client],
      identitySource: ['$request.header.Authorization'],
    })

    httpApi.addRoutes({
      path: '/posts',
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('get-posts-integration', getPostsLambda),
    });
    httpApi.addRoutes({
      path: '/posts/{postId}',
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('get-post-integration', getPostLambda),
    });
    httpApi.addRoutes({
      path: '/posts/new',
      methods: [apigateway.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('create-post-integration', createPostLambda),
      authorizer: authorizer,
    });

    httpApi.addRoutes({
      path: '/games/survivor/cast',
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('get-cast-integration', getCastLambda),
      authorizer: authorizer,
    })
    httpApi.addRoutes({
      path: '/games/survivor/cast',
      methods: [apigateway.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('set-cast-integration', setCastLambda),
      authorizer: authorizer,
    })

    httpApi.addRoutes({
      path: '/games/survivor/predictions',
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('get-predictions-integration', getPredictionsLambda),
      authorizer: authorizer,
    })
    httpApi.addRoutes({
      path: '/games/survivor/predictions',
      methods: [apigateway.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('set-prediction-integration', setPredictionLambda),
      authorizer: authorizer,
    })
    httpApi.addRoutes({
      path: '/games/survivor/predictions/delete',
      methods: [apigateway.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('delete-prediction-integration', deletePredictionLambda),
      authorizer: authorizer,
    })
    httpApi.addRoutes({
      path: '/games/survivor/userPredictions',
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('get-user-predictions-integration', getUserPredictionsLambda),
      authorizer: authorizer,
    })
    httpApi.addRoutes({
      path: '/games/survivor/userPredictions/{sub}',
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('get-user-prediction-integration', getUserPredictionLambda),
      authorizer: authorizer,
    })
    httpApi.addRoutes({
      path: '/games/survivor/userPredictions',
      methods: [apigateway.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('set-user-prediction-integration', setUserPredictionLambda),
      authorizer: authorizer,
    })
    httpApi.addRoutes({
      path: '/games/survivor/predictions/complete',
      methods: [apigateway.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('complete-prediction-integration', completePredictionLambda),
      authorizer: authorizer,
    })
    httpApi.addRoutes({
      path: '/games/survivor/leaderboard',
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('get-leaderboard-integration', getLeaderboardLambda),
      authorizer: authorizer,
    });
    httpApi.addRoutes({
      path: '/games/survivor/userInventory/{sub}',
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('get-user-inventory-integration', getUserInventoryLambda),
      authorizer: authorizer,
    });
    httpApi.addRoutes({
      path: '/games/survivor/userInventory',
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('get-all-user-inventories-integration', getAllUserInventoriesLambda),
      authorizer: authorizer,
    });
    httpApi.addRoutes({
      path: '/games/survivor/items/{sub}',
      methods: [apigateway.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('put-item-integration', putItemLambda),
      authorizer: authorizer,
    });

    // Image API routes
    httpApi.addRoutes({
      path: '/images/uploadUrl/{imageFileName}',
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('get-image-upload-url-integration', getImageUploadUrl),
      authorizer: authorizer,
    });
    httpApi.addRoutes({
      path: '/images/metadata',
      methods: [apigateway.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('put-image-metadata-integration', putImageMetadata),
      authorizer: authorizer,
    });
    httpApi.addRoutes({
      path: '/images/metadata',
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('get-all-images-metadata-integration', getAllImagesMetadata),
      authorizer: authorizer,
    })

    // Outputs - e.g. userpoolId, clientId, apiUrls, to be fed into the website stack
    new CfnOutput(this, 'user-pool-id-output', {
      value: auth.userPool.userPoolId,
      description: 'The id for the created user pool',
      exportName: `userPoolId-${props.domain}`,
    });
    new CfnOutput(this, 'user-pool-client-id-output', {
      value: auth.client.userPoolClientId,
      description: 'The client id for the photographer website app',
      exportName: `userPoolClientId-${props.domain}`,
    });
    new CfnOutput(this, 'api-url-output', {
      value: httpApi.url!,
      description: 'The base URL for the photographer API',
      exportName: `apiUrl-${props.domain}`,
    })
  }
}