import {
  Stack,
  StackProps,
  RemovalPolicy,
  CfnOutput,
  aws_cognito as cognito,
} from "aws-cdk-lib";
import { Construct } from "constructs";

/**
 * Shared Cognito user pool for every stage (Dev + Prod).
 *
 * Staging-cleanup Phase 1 step 3: this stack ADOPTS the pre-existing physical pool
 * us-east-1_TLQmyLdLo, which was orphaned out of DevStage's backend stack in step 2.
 * Adoption is done with a local `cdk import` (the pool's identifier is a generated id,
 * so `--import-existing-resources` can't match it — `cdk import` lets us supply the id).
 *
 * The pool config below must match the live pool exactly, or the post-import `cdk diff`
 * will report drift. Verified against `aws cognito-idp describe-user-pool
 * --user-pool-id us-east-1_TLQmyLdLo` on 2026-09-05:
 *   - name photographerWebsiteUsers-Dev (kept as-is to match; rename is a later cosmetic change)
 *   - password policy: min 8, lowercase + digits required, no uppercase/symbols
 *   - autoVerify email, self sign-up enabled, MFA off
 *   - account recovery phone(1) then email(2) == CDK default PHONE_WITHOUT_MFA_AND_EMAIL
 */
export class PSAuthStack extends Stack {
  public readonly userPool: cognito.UserPool;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, 'pool', {
      userPoolName: 'photographerWebsiteUsers-Dev',
      selfSignUpEnabled: true,
      autoVerify: { email: true },
      // relaxed from the Cognito default to lower the signup barrier;
      // keep frontend/src/auth/passwordPolicy.js in sync with this.
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: false,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.PHONE_WITHOUT_MFA_AND_EMAIL,
      mfa: cognito.Mfa.OFF,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Shared, unqualified export. Each stage's backend imports this in step 4
    // (Fn.importValue('userPoolId')) instead of hardcoding the literal pool id.
    new CfnOutput(this, 'user-pool-id-output', {
      value: this.userPool.userPoolId,
      description: 'Shared Cognito user pool id, imported by every stage',
      exportName: 'userPoolId',
    });
  }
}
