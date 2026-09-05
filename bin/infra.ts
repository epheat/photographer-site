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
  apiEndpoint: "https://ez567m8fv2.execute-api.us-east-1.amazonaws.com",
  userPoolClientId: "1pscc7mteomtr9o9upfbmc97bk",
  env: defaultEnv,
})

// Phase 2: ProdStage is instantiated so it can be deployed standalone via a local
// `cdk deploy ProdStage/ps-backend --import-existing-resources`. It is deliberately NOT
// added to delivery.pipeline.addStage(...) yet — that is Phase 6, after the apex cutover.
const prodStage = new PSAppStage(app, 'ProdStage', {
  domain: "Prod",
  apiEndpoint: "https://ejocg7sajg.execute-api.us-east-1.amazonaws.com",
  userPoolClientId: "1nfu38iklkl8m08r6l6jspskr3",
  env: defaultEnv,
})

// PSAuthStage must be added AHEAD of devStage: DevStage imports userPoolId via a raw
// Fn.importValue, which CDK Pipelines does not track as a dependency, so it won't
// auto-order the stages. The pool stack already exists (adopted via cdk import in step 3),
// so this first pipeline-managed deploy of it is a no-op.
delivery.pipeline.addStage(authStage);
delivery.pipeline.addStage(devStage);

// delivery.pipeline.addStage(prodStage);
