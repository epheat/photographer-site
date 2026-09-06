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
import { execSync } from "child_process";
import * as fs from "fs-extra";
import { Construct } from "constructs";

export interface PSWebsiteStackProps extends StackProps {
  domain: String,
  // Concrete (synth-time) values baked into the frontend build. They must be plain strings,
  // not CDK tokens: the bundling `npm run build` runs at synth time, before CloudFormation
  // resolves any imports/refs, so a token would bake in literally. See plan item 3.
  apiEndpoint: string,
  userPoolClientId: string,
  // Primary custom domain for the distribution (e.g. 'evanheaton.com' or 'dev.evanheaton.com').
  // Undefined = no custom domain; the site is served on the distribution's *.cloudfront.net name.
  websiteDomain?: string,
  // Extra domains served by the same distribution (e.g. ['www.evanheaton.com']). Each gets a
  // cert SAN and its own alias A-record in the zone.
  websiteDomainAliases?: string[],
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

    // Per-stage custom domain. Staging-cleanup Phase 4/5: Dev serves dev.evanheaton.com and
    // Prod serves the apex evanheaton.com (+ www). An undefined websiteDomain means no custom
    // domain — the distribution is reached on its *.cloudfront.net name. CloudFront rejects
    // duplicate alternate domain names across distributions account-wide, so the apex can only
    // be attached to one distribution at a time — the cutover releases it from Dev, then
    // attaches it to Prod.
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'hostedZone', {
      hostedZoneId: 'Z0357170UGJZSZM98IY8',
      zoneName: 'evanheaton.com',
    });
    const websiteDomains = props.websiteDomain
      ? [props.websiteDomain, ...(props.websiteDomainAliases ?? [])]
      : [];
    let sslCertificate: acm.Certificate | undefined;
    if (props.websiteDomain) {
      sslCertificate = new acm.Certificate(this, 'ssl-certificate', {
        domainName: props.websiteDomain,
        subjectAlternativeNames: props.websiteDomainAliases,
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
      ...(props.websiteDomain ? {
        certificate: sslCertificate,
        domainNames: websiteDomains,
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
    // One alias A-record per domain: the apex uses no recordName (defaults to the zone apex);
    // subdomains (dev, www) use their full name.
    websiteDomains.forEach((recordDomain, i) => {
      new route53.ARecord(this, i === 0 ? 'alias-record' : `alias-record-${i}`, {
        ...(recordDomain === hostedZone.zoneName ? {} : { recordName: recordDomain }),
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
        zone: hostedZone,
      });
    });

    const frontendEntry = path.join(__dirname, '../frontend'); // path to the Vue app
    new s3deploy.BucketDeployment(this, 'static-website-deployment', {
      sources: [
        s3deploy.Source.asset(frontendEntry, {
          bundling: {
            local: {
              tryBundle(outputDir: string) {
                try {
                  execSync('npm --version'); // check if npm is installed for local build.
                  // Wipe dist first: vue-cli-service emits content-hashed filenames, so a stale
                  // bundle from a previous (e.g. other-stage) build would otherwise linger and,
                  // combined with the copy below, ship the wrong per-stage VUE_APP_API_ENDPOINT.
                  fs.removeSync(path.join(frontendEntry, 'dist'));
                  // execSync (not exec): the build MUST finish before we copy dist. The old async
                  // exec returned immediately and copied a stale dist, shipping the wrong endpoint.
                  execSync([
                    'npm i',
                    'npm run build'
                  ].join('&&'), {
                    env: {
                      ...process.env,
                      VUE_APP_COGNITO_USERPOOL_ID: "us-east-1_TLQmyLdLo",
                      VUE_APP_COGNITO_CLIENT_ID: props.userPoolClientId,
                      VUE_APP_API_ENDPOINT: props.apiEndpoint,
                    },
                    cwd: frontendEntry,
                    stdio: 'inherit',
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
