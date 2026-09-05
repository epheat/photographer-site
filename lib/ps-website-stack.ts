import {
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
  DockerImage,
  PhysicalName,
  Stack,
  StackProps
} from "aws-cdk-lib";
import * as path from "path";
import { exec } from "child_process";
import * as fs from "fs-extra";
import { Construct } from "constructs";

export interface PSWebsiteStackProps extends StackProps {
  domain: String,
  // Concrete (synth-time) values baked into the frontend build. They must be plain strings,
  // not CDK tokens: the bundling `npm run build` runs at synth time, before CloudFormation
  // resolves any imports/refs, so a token would bake in literally. See plan item 3.
  apiEndpoint: string,
  userPoolClientId: string,
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

    // Custom apex domain wiring — Dev only for now. Staging-cleanup Phase 3 deploys Prod's
    // website with NO custom domain (served on its *.cloudfront.net name) so it can be
    // validated without colliding with the apex aliases Dev currently holds — CloudFront
    // rejects duplicate alternate domain names across distributions account-wide. Phase 5
    // adds the apex to Prod's distribution and flips Route53.
    const useApexDomain = props.domain !== "Prod";
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'hostedZone', {
      hostedZoneId: 'Z0357170UGJZSZM98IY8',
      zoneName: 'evanheaton.com',
    });
    let sslCertificate: acm.Certificate | undefined;
    if (useApexDomain) {
      sslCertificate = new acm.Certificate(this, 'ssl-certificate', {
        domainName: 'evanheaton.com',
        subjectAlternativeNames: [
          '*.evanheaton.com'
        ],
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });
    }
    const distribution = new cloudfront.Distribution(this, 'cloudfront-distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      ...(useApexDomain ? {
        certificate: sslCertificate,
        domainNames: ['evanheaton.com', 'www.evanheaton.com'],
      } : {}),
      // the app is a client-side-routed SPA behind a private (OAC) S3 origin: a deep link like
      // /posts/5 isn't a real S3 key, and a missing key comes back as 403 (not 404) since the
      // origin has no s3:ListBucket grant to tell CloudFront "doesn't exist" from "not authorized".
      // Rewrite both to index.html so vue-router can take over client-side.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });
    if (useApexDomain) {
      new route53.ARecord(this, 'alias-record', {
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
        zone: hostedZone,
      });
    }

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
                      VUE_APP_COGNITO_CLIENT_ID: props.userPoolClientId,
                      VUE_APP_API_ENDPOINT: props.apiEndpoint,
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
              // These are concrete per-stage strings (not CDK tokens), passed in via props,
              // because the build runs at synth time. userPoolId is the shared pool; clientId
              // and apiEndpoint differ per stage. None are secrets. See plan item 3.
              VUE_APP_COGNITO_USERPOOL_ID: "us-east-1_TLQmyLdLo",
              VUE_APP_COGNITO_CLIENT_ID: props.userPoolClientId,
              VUE_APP_API_ENDPOINT: props.apiEndpoint,
            },
          }
        }
      )],
      destinationBucket: bucket,
      distribution,
    });
  }
}
