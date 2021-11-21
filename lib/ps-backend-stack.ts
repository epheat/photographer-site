import * as cdk from "@aws-cdk/core";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import * as lambda from "@aws-cdk/aws-lambda";
import * as nodejs from '@aws-cdk/aws-lambda-nodejs';
import * as path from "path";
import * as apigateway from "@aws-cdk/aws-apigatewayv2";
import * as integrations from "@aws-cdk/aws-apigatewayv2-integrations";
import * as route53 from "@aws-cdk/aws-route53";
import * as targets from '@aws-cdk/aws-route53-targets';
import * as acm from '@aws-cdk/aws-certificatemanager';
import { PSAuth } from "./constructs/ps-auth";


export interface PSBackendStackProps extends cdk.StackProps {
  domain: String,
}

export class PSBackendStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: PSBackendStackProps) {
    super(scope, id, props);

    // Website hosted at evanheaton.com
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'hostedZone', {
      hostedZoneId: 'Z0357170UGJZSZM98IY8',
      zoneName: 'evanheaton.com',
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

    // AuthN
    // a cognito userpool for vending JWTs, and associated IAM roles
    const auth = new PSAuth(this, 'ps-auth');

    // Lambda functions
    // for now just a default logging function
    const getPostsLambda = new nodejs.NodejsFunction(this, 'get-posts-func', {
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, "./lambda/posts.ts"),
      handler: 'get',
    });
    postsTable.grantReadData(getPostsLambda);

    const createPostLambda = new nodejs.NodejsFunction(this, 'put-posts-func', {
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: path.join(__dirname, "./lambda/posts.ts"),
      handler: 'put',
    });
    postsTable.grantReadWriteData(createPostLambda);

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
    });
    // const customDomain = new apigateway.DomainName(this, 'api-domain', {
    //   domainName: 'evanheaton.com',
    //   // TODO: don't use certificate arn here, use import/output
    //   certificate: acm.Certificate.fromCertificateArn(this, 'api-certificate', 'arn:aws:acm:us-east-1:854299661720:certificate/5236d810-165d-43b7-8e1e-46e701a61673'),
    // })

    httpApi.addRoutes({
      path: '/posts',
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.LambdaProxyIntegration({
        handler: getPostsLambda,
      })
    });
    httpApi.addRoutes({
      path: '/posts/new',
      methods: [apigateway.HttpMethod.POST],
      integration: new integrations.LambdaProxyIntegration({
        handler: createPostLambda,
      })
    })
    // TODO: authorizer

    // const apiAliasRecord = new route53.ARecord(this, 'api-alias-record', {
    //   zone: hostedZone,
    //   target: new route53.RecordTarget.fromAlias(new targets.ApiGatewayv2DomainProperties(httpApi))
    // });
    
    // Outputs - e.g. userpoolId, clientId, apiUrls, to be fed into the website stack
    new cdk.CfnOutput(this, 'user-pool-id-output', {
      value: auth.userPool.userPoolId,
      description: 'The id for the created user pool',
      exportName: `userPoolId-${props.domain}`,
    });
    new cdk.CfnOutput(this, 'user-pool-client-id-output', {
      value: auth.client.userPoolClientId,
      description: 'The client id for the photographer website app',
      exportName: `userPoolClientId-${props.domain}`,
    });
    new cdk.CfnOutput(this, 'api-url-output', {
      value: httpApi.url!,
      description: 'The base URL for the photographer API',
      exportName: `apiUrl-${props.domain}`,
    })
  }
}