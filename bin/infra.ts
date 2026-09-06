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

// Shared user pool. Staging-cleanup Phase 1: adopted standalone via `cdk import` in step 3,
// then handed to the pipeline in step 5 (added ahead of devStage below).
const authStage = new PSAuthStage(app, 'PSAuthStage', {
  env: defaultEnv,
})

const devStage = new PSAppStage(app, 'DevStage', {
  domain: "Dev",
  userPoolClientId: "1pscc7mteomtr9o9upfbmc97bk",
  websiteDomain: "dev.evanheaton.com",
  env: defaultEnv,
})

// Phase 2: ProdStage is instantiated so it can be deployed standalone via a local
// `cdk deploy ProdStage/ps-backend --import-existing-resources`. It is deliberately NOT
// added to delivery.pipeline.addStage(...) yet — that is Phase 6, after the apex cutover.
const prodStage = new PSAppStage(app, 'ProdStage', {
  domain: "Prod",
  userPoolClientId: "1nfu38iklkl8m08r6l6jspskr3",
  websiteDomain: "evanheaton.com",
  websiteDomainAliases: ["www.evanheaton.com"],
  env: defaultEnv,
})

// PSAuthStage must be added AHEAD of devStage: DevStage imports userPoolId via a raw
// Fn.importValue, which CDK Pipelines does not track as a dependency, so it won't
// auto-order the stages. The pool stack already exists (adopted via cdk import in step 3),
// so this first pipeline-managed deploy of it is a no-op.
delivery.pipeline.addStage(authStage);
delivery.pipeline.addStage(devStage);

// Phase 6: Prod is now managed by the pipeline, gated behind a manual approval so a bad push
// to main can't auto-deploy to the live apex. ProdStage's stacks already exist (deployed
// locally in Phases 2-5), so the pipeline's first run of this stage is a reconcile after
// approval, not a fresh create.
delivery.pipeline.addStage(prodStage, {
  pre: [new pipelines.ManualApprovalStep('PromoteToProd')],
});
