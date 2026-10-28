#!/usr/bin/env node
import 'source-map-support/register';
import { PSPipelineStack } from '../lib/ps-pipeline-stack';
import { PSAppStage } from '../lib/ps-app-stage';
import { PSAuthStage } from '../lib/ps-auth-stage';
import { App, pipelines } from 'aws-cdk-lib';

const app = new App();

const defaultEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const delivery = new PSPipelineStack(app, 'PS-DeliveryPipeline', {
  name: 'PhotographerSiteDeliveryPipeline',
  env: defaultEnv,
});

// Shared user pool, consumed by both the Dev and Prod stages.
const authStage = new PSAuthStage(app, 'PSAuthStage', {
  env: defaultEnv,
})

const devStage = new PSAppStage(app, 'DevStage', {
  domain: "Dev",
  userPoolClientId: "1pscc7mteomtr9o9upfbmc97bk",
  websiteDomain: "dev.evanheaton.com",
  env: defaultEnv,
})

const prodStage = new PSAppStage(app, 'ProdStage', {
  domain: "Prod",
  userPoolClientId: "1nfu38iklkl8m08r6l6jspskr3",
  websiteDomain: "evanheaton.com",
  websiteDomainAliases: ["www.evanheaton.com"],
  env: defaultEnv,
})

// PSAuthStage must be added AHEAD of devStage: DevStage imports userPoolId via a raw
// Fn.importValue, which CDK Pipelines does not track as a dependency, so the order here
// is what guarantees the pool stack deploys first.
delivery.pipeline.addStage(authStage);
delivery.pipeline.addStage(devStage);

// Prod is gated behind a manual approval so a bad push to main can't auto-deploy to the
// live apex.
delivery.pipeline.addStage(prodStage, {
  pre: [new pipelines.ManualApprovalStep('PromoteToProd')],
});
