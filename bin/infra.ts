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

// Shared user pool. Staging-cleanup Phase 1: adopted standalone via `cdk import` in step 3,
// then handed to the pipeline in step 5 (added ahead of devStage below).
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

// PSAuthStage must be added AHEAD of devStage: DevStage imports userPoolId via a raw
// Fn.importValue, which CDK Pipelines does not track as a dependency, so it won't
// auto-order the stages. The pool stack already exists (adopted via cdk import in step 3),
// so this first pipeline-managed deploy of it is a no-op.
delivery.pipeline.addStage(authStage);
delivery.pipeline.addStage(devStage);

// delivery.pipeline.addStage(prodStage);
