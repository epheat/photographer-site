#!/usr/bin/env node
import 'source-map-support/register';
import { PSPipelineStack } from '../lib/ps-pipeline-stack';
import { PSAppStage } from '../lib/ps-app-stage';
import { PSAuthStage } from '../lib/ps-auth-stage';
import { App } from 'aws-cdk-lib';

const app = new App();

const defaultEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const delivery = new PSPipelineStack(app, 'PS-DeliveryPipeline', {
  name: 'PhotographerSiteDeliveryPipeline',
  env: defaultEnv,
});

// Shared user pool. Staging-cleanup Phase 1: adopted standalone via `cdk import` in step 3;
// NOT added to delivery.pipeline.addStage(...) until step 5 (must land ahead of devStage).
const authStage = new PSAuthStage(app, 'PSAuthStage', {
  env: defaultEnv,
})

const devStage = new PSAppStage(app, 'DevStage', {
  domain: "Dev",
  env: defaultEnv,
})

// const prodStage = new PSAppStage(app, 'ProdStage', {
//   domain: "Prod",
//   env: defaultEnv,
// })

delivery.pipeline.addStage(devStage);

// delivery.pipeline.addStage(prodStage);
