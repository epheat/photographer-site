import {
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
  DockerImage,
  Fn,
  PhysicalName,
  Stack,
  StackProps
} from "aws-cdk-lib";
import * as path from "path";
import { exec } from "child_process";
import * as fs from "fs-extra";
import { Construct } from "constructs";

export interface PSWebsiteStackProps extends StackProps {
  domain: String
}

export class PSWebsiteStack extends Stack {
  constructor(scope: Construct, id: string, props: PSWebsiteStackProps) {
    super(scope, id, props);
        
    // S3 Storage
    const bucket = new s3.Bucket(this, 'website-static-asset', {
      bucketName: PhysicalName.GENERATE_IF_NEEDED,
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
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      certificate: sslCertificate,
      domainNames: ['evanheaton.com', 'www.evanheaton.com'],
    });
    origins.S3Origin
    const aliasRecord = new route53.ARecord(this, 'alias-record', {
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      zone: hostedZone,
    });

    const userPoolId = Fn.importValue(`userPoolId-${props.domain}`);
    const userPoolClientId = Fn.importValue(`userPoolClientId-${props.domain}`);

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
            image: DockerImage.fromRegistry('public.ecr.aws/sam/build-nodejs20.x:latest'),
            command: [
              'bash', '-c', [
                'rm -rf /asset-input/node_modules',
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
