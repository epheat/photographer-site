import * as cdk from "@aws-cdk/core";
import * as s3 from "@aws-cdk/aws-s3";
import * as s3deploy from "@aws-cdk/aws-s3-deployment";
import * as cloudfront from "@aws-cdk/aws-cloudfront";
import * as origins from "@aws-cdk/aws-cloudfront-origins";
import * as route53 from "@aws-cdk/aws-route53";
import * as targets from "@aws-cdk/aws-route53-targets";
import * as acm from '@aws-cdk/aws-certificatemanager';
import * as path from "path";
import { exec, spawnSync } from "child_process";
import * as fs from "fs-extra";

export interface PSWebsiteStackProps extends cdk.StackProps {
  domain: String
}

export class PSWebsiteStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: PSWebsiteStackProps) {
    super(scope, id, props);
        
    // S3 Storage
    const bucket = new s3.Bucket(this, 'website-static-asset', {
      bucketName: cdk.PhysicalName.GENERATE_IF_NEEDED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      accessControl: s3.BucketAccessControl.PRIVATE,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // Website hosted at evanheaton.com
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'hostedZone', {
      hostedZoneId: 'Z0357170UGJZSZM98IY8',
      zoneName: 'evanheaton.com',
    });
    const sslCertificate = new acm.Certificate(this, 'ssl-certificate', {
      domainName: 'evanheaton.com',
      subjectAlternativeNames: [
        '*.evanheaton.com'
      ],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });
    const distribution = new cloudfront.Distribution(this, 'cloudfront-distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(bucket),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      certificate: sslCertificate,
      domainNames: ['evanheaton.com', 'www.evanheaton.com'],
    });
    const aliasRecord = new route53.ARecord(this, 'alias-record', {
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      zone: hostedZone,
    });

    const userPoolId = cdk.Fn.importValue(`userPoolId-${props.domain}`);
    const userPoolClientId = cdk.Fn.importValue(`userPoolClientId-${props.domain}`);

    const frontendEntry = path.join(__dirname, '../frontend'); // path to the Vue app
    new s3deploy.BucketDeployment(this, 'static-website-deployment', {
      sources: [
        s3deploy.Source.asset(frontendEntry, {
          bundling: {
            local: {
              tryBundle(outputDir: string) {
                try {
                  exec('npm --version'); // check if npm is installed for local build.
                  exec([
                    'npm i',
                    'npm run build'
                  ].join('&&'), {
                    env: {
                      ...process.env,
                      VUE_APP_COGNITO_USERPOOL_ID: "us-east-1_TLQmyLdLo",
                      VUE_APP_COGNITO_CLIENT_ID: "1pscc7mteomtr9o9upfbmc97bk",
                    },
                    cwd: frontendEntry
                  });
                  // copy bundle to the CDK output dir
                  fs.copySync(path.join(frontendEntry, 'dist'), outputDir);
                } catch(err) {
                  console.log(err);
                  return false;
                }
                return true;
              }
            },
            user: 'root',
            image: cdk.DockerImage.fromRegistry('public.ecr.aws/sam/build-nodejs14.x:latest'),
            command: [
              'bash', '-c', [
                'cd /asset-input',
                'npm ci',
                'npm run build',
                'cp -r /asset-input/dist/* /asset-output/',
              ].join('&&'),
            ],
            environment: {
              // tried to reference the userpool attributes, but those are CDK IResolvable tokens.
              // i'll just hard code for now, anyways the clientId and userpoolId aren't secrets.
              // https://stackoverflow.com/questions/41277968/securing-aws-cognito-user-pool-and-client-id-on-a-static-web-page
              VUE_APP_COGNITO_USERPOOL_ID: "us-east-1_TLQmyLdLo",
              VUE_APP_COGNITO_CLIENT_ID: "1pscc7mteomtr9o9upfbmc97bk"
            },
          }
        }
      )],
      destinationBucket: bucket,
      distribution,
    });
  }
}
