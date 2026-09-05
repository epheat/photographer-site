import { Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PSAuthStack } from './ps-auth-stack';

/**
 * Wraps the shared user-pool stack. Meant to be added to the pipeline AHEAD of the app
 * stages (staging-cleanup Phase 1 step 5) so its `userPoolId` export exists before either
 * stage imports it. Until then it is deployed standalone via `cdk import` (step 3).
 */
export class PSAuthStage extends Stage {
  constructor(scope: Construct, id: string, props?: StageProps) {
    super(scope, id, props);
    new PSAuthStack(this, 'ps-auth', {});
  }
}
