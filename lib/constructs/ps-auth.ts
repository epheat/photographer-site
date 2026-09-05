import { Construct } from "constructs";
import { aws_cognito as cognito } from "aws-cdk-lib";

export interface PSAuthProps {
  stage?: String,
  // Id of the shared Cognito user pool to import. Staging-cleanup Phase 1 step 2:
  // the pool is no longer created by this construct — see below.
  userPoolId: string,
}

export class PSAuth extends Construct {
  public readonly userPool: cognito.IUserPool;
  public readonly client: cognito.UserPoolClient;
  // TODO: export the roles that cognito users use

  constructor(scope: Construct, id: string, props: PSAuthProps) {
    super(scope, id);

    // Staging-cleanup Phase 1 step 2: the user pool is no longer created here. It is the
    // shared pool (us-east-1_TLQmyLdLo) holding all real users, and it is imported by id.
    // Removing the `new cognito.UserPool(...)` construct drops the pool from this stack's
    // CloudFormation management; because the deployed pool has DeletionPolicy: Retain
    // (step 1, already in effect), CFN orphans the physical pool rather than deleting it.
    // Step 3 adopts the orphaned pool into a dedicated PSAuthStack via
    // `cdk deploy --import-existing-resources`, replicating the pool's exact config
    // (password policy, self-signup, email auto-verify, etc. — see git history of this file
    // and docs/staging-cleanup/plan.md, "Shared user pool"). Step 4 swaps this literal id
    // for `Fn.importValue('userPoolId')`.
    this.userPool = cognito.UserPool.fromUserPoolId(this, 'imported-pool', props.userPoolId);

    // Each stage keeps its own app client against the shared pool.
    this.client = new cognito.UserPoolClient(this, 'ps-app', {
      generateSecret: false,
      userPool: this.userPool,
      userPoolClientName: `photographerWebsite-${props.stage || "Dev"}`,
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO
      ],
      oAuth: {
        flows: { implicitCodeGrant: true },
      }
    })
  }
}
