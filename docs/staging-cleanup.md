# Dev/Prod staging cleanup

A checklist for making this repo actually support two environments. Nothing here is urgent — the site works — but most of it has to be done before `ProdStage` can be uncommented in `bin/infra.ts`, because a second stage would either fail to deploy or quietly share resources with the first.

## Where things stand

There is one deployed stage, named `DevStage`, and **it is the live site**. Its website stack owns the apex domain (`evanheaton.com` plus `www`), so "Dev" is production in everything but name. Its API is stage-scoped at `dev.api.evanheaton.com`, and the frontend doesn't use that hostname anyway — it talks to a raw `execute-api` URL hardcoded in `main.ts`.

Roughly half the resources are already stage-scoped and need no work: the `EHImageMetadata` table, the static data bucket, the API custom domain, and the website asset bucket (which uses `PhysicalName.GENERATE_IF_NEEDED`). The other half is below.

---

## 1. Name collisions that block a second stage

Each of these has a hardcoded physical name, so CloudFormation would fail to create the Prod copy in the same account and region.

- [ ] **`PSPosts` table** — `lib/ps-backend-stack.ts` line 41. Prefix it like the image metadata table already is: `` `${props.domain}-PSPosts` ``.
- [ ] **`PSGameData` table** — `lib/ps-backend-stack.ts` line 54. Same treatment.
- [ ] **Cognito user pool** — decided: **one pool, shared by both stages**, not one per stage. See below.

Renaming a table in CDK (adding the prefix) makes CloudFormation try to replace it, which would drop the live data. The plan:

1. Point-in-time restore `PSPosts` and `PSGameData` to new tables named `Prod-PSPosts` and `Prod-PSGameData` — the prefixed name directly, since there's no rename step, only a restore-to-new-table one. PITR restore carries over key schema, GSIs, and billing mode automatically, so the restored table already matches what CDK will define. PITR itself is **not** re-enabled on the restored table by default, so turn it back on; reapply tags/TTL/streams by hand if any are set (none currently are).
2. Add the prefixed table definitions to CDK (same billing mode, keys, GSIs — only `tableName` changes) and deploy `ProdStage` with [`cdk deploy --import-existing-resources`](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/import-resources-automatically.html). **This has to be a local/CI `cdk deploy`, not the pipeline** — `ImportExistingResources` is a `CreateChangeSet` API parameter that CDK's CLI sets for you, but CodePipeline's native `CloudFormation` deploy action (what `lib/ps-pipeline-stack.ts`'s `pipelines.CodePipeline` actually uses to deploy every stack) doesn't expose that parameter at all, and CDK Pipelines doesn't wire it through either. So: run `cdk deploy` for `ProdStage` directly, from outside the pipeline, *before* adding `ProdStage` to `delivery.pipeline.addStage(...)` in item 5 — once the stack exists and is healthy, the pipeline's ordinary changeset flow takes over and no further importing is needed. Import only succeeds if the live table's config matches the template exactly, which it should given step 1.
3. Once `ProdStage` is deployed and reading from the imported tables, flip `DevStage` to the prefixed names too (`Dev-PSPosts`, `Dev-PSGameData`); CDK creates those fresh and empty.
4. Leave the original unprefixed `PSPosts`/`PSGameData` tables in place, untouched, as a rollback copy until Prod is confirmed healthy — delete them by hand afterward.

### Shared user pool

Decided: Dev and Prod use **the same Cognito user pool**, not one each — and it lives in **its own stack**, not inside either stage's `PSBackendStack`. The pool that exists today (`us-east-1_TLQmyLdLo`) already holds the real users and the hand-created `Admins` group membership; splitting into two pools was rejected because Cognito can't export passwords, so that would mean a manual reset/re-invite for everyone. Leaving it inside `DevStage`'s stack was also rejected: that would make the throwaway/test environment permanently load-bearing for Prod's auth, and it could never be torn down or recreated without an auth-continuity plan.

A physical user pool has no PITR-style copy, so moving it is an adopt, not a copy, and the order matters:

- [ ] Add a `PSAuthStack` (holding just the `UserPool`, no client) wrapped in a thin `PSAuthStage`, meant to be added to the pipeline **ahead of** `DevStage` and `ProdStage` so its export exists before either app stage imports it.
- [ ] Migration sequence:
  1. Add an explicit `RemovalPolicy.RETAIN` on the `UserPool` in `lib/constructs/ps-auth.ts` and deploy `DevStage` normally through the pipeline — a policy change, not a replacement.
  2. Remove the `new cognito.UserPool(...)` construct from `DevStage`'s stack, temporarily pointing its existing `UserPoolClient` at `cognito.UserPool.fromUserPoolId(this, 'imported-pool', 'us-east-1_TLQmyLdLo')` (the literal ID, since `PSAuthStack` doesn't exist yet), and deploy through the pipeline. Because of the retain policy from step 1, CloudFormation drops the pool from `DevStage`'s management without touching the actual resource — it's now orphaned and CFN-unmanaged.
  3. Define `PSAuthStack` with a `UserPool` matching the orphaned pool's exact config, and deploy it with a **local/CI `cdk deploy --import-existing-resources`**, same as the DynamoDB tables in item 1 — CodePipeline's native `CloudFormation` action can't do this, so it has to happen outside the pipeline, before `PSAuthStage` is ever added via `addStage()`.
  4. Swap `DevStage`'s temporary literal `fromUserPoolId('us-east-1_TLQmyLdLo')` for `Fn.importValue('userPoolId')` and deploy through the pipeline. This resolves to the same ID either way, so it's cosmetic at the infrastructure level, but it's what makes `DevStage` symmetric with `ProdStage` going forward.
  5. Only then add `PSAuthStage` to `delivery.pipeline.addStage(...)`, ahead of `devStage`.
- [ ] `ProdStage`'s `PSBackendStack` imports the same `Fn.importValue('userPoolId')` and creates its own `UserPoolClient` against it — same as `DevStage`'s, once step 4 lands.
- [ ] Each stage keeps its own `HttpUserPoolAuthorizer` scoped to only its own client (`lib/ps-backend-stack.ts` line 423 already does this per-stage). So even though the user directory, passwords, and groups are shared, a token issued for one stage's client won't authorize against the other stage's API — the sharing is at the user/group level, not the token level.

---

## 2. Lambdas that reach for hardcoded resources

These would run in Prod and read and write **Dev's** data, which is worse than failing.

- [ ] **`lib/lambda/survivor.ts` line 15** — `const tableName = "PSGameData"`. Take it from `process.env` and set the env var in the stack, the way `images.ts` and `mukhunt.ts` already do. Fourteen lambdas in the stack need the variable added.
- [ ] **`lib/lambda/survivor.ts` line 20** — `const userPoolId = "us-east-1_TLQmyLdLo"`, already carrying a `TODO: feed in from environment variable`. Used by the prediction reminder path.
- [ ] **`lib/lambda/posts.ts` line 12** — `const tableName = "PSPosts"`. Same fix.

Do this one before or alongside item 1: prefixing the tables without also fixing these hardcoded names would point Prod's lambdas at a table that no longer exists under that name.

---

## 3. The website stack is environment-blind

`lib/ps-website-stack.ts` hardcodes the production domain end to end — hosted zone lookup (line 37), certificate (line 42), and `domainNames: ['evanheaton.com', 'www.evanheaton.com']` on the distribution (line 56). CloudFront rejects duplicate alternate domain names across distributions, so a second stage fails at deploy time.

- [ ] Derive the domain per stage, e.g. apex for Prod and `dev.evanheaton.com` for Dev, and pass it through `PSAppStageProps` alongside `domain`.
- [ ] **Wire up the user pool values that are already imported but unused.** Lines 76 and 77 do `Fn.importValue(\`userPoolId-${props.domain}\`)` and assign to `userPoolId` / `userPoolClientId` — then nothing reads them. Both bundling paths hardcode the Dev pool instead (lines 82 and 110, local and Docker). The comment there explains why: the values were CDK tokens at the time. Resolving that is the real work; the import is already sitting there waiting. Once the [shared user pool](#shared-user-pool) lands, `userPoolId` resolves to the same value for both stages (both import it from `PSAuthStack`) but `userPoolClientId` still needs to differ per stage, since each stage keeps its own client.
- [ ] **`frontend/src/main.ts` line 17** — the API endpoint is a hardcoded `execute-api` URL, so every environment's frontend calls the same API. Pass it in as `VUE_APP_API_ENDPOINT` from the website stack's bundling environment, defaulting to the stage's `{domain}.api.evanheaton.com`.

---

## 4. Production safety

- [ ] **`lib/ps-backend-stack.ts` line 87** — the static data bucket is `RemovalPolicy.DESTROY`. Fine for a throwaway dev stage; not what you want holding the only copy of guest photos. Make it stage-dependent, `RETAIN` for Prod.
- [ ] Consider `RemovalPolicy.RETAIN` plus `pointInTimeRecovery` on the Prod tables. PITR is already on for all three.
- [ ] Decide what Dev's data should be. The [user pool is intentionally shared](#shared-user-pool), so no new test user or `Admins` group setup is needed there — existing accounts and group membership already work against both stages. What's actually empty on a fresh Dev deploy is the game/posts data itself (item 1's prefixed tables), so this is really about whether Dev needs seed data of its own, or is fine starting blank.

---

## 5. Pipeline

- [ ] `bin/infra.ts` — uncomment `ProdStage`, but don't add it to the pipeline yet. First deploy it standalone with a local/CI `cdk deploy --import-existing-resources` (see item 1) so the restored tables get imported outside of CodePipeline's changeset flow, which can't do that. Only call `delivery.pipeline.addStage(prodStage)` once that initial deploy has succeeded.
- [ ] Add a manual approval step before the Prod stage. `lib/ps-pipeline-stack.ts` deploys straight from `main` with no gate.
- [ ] Consider whether Dev should deploy from a branch other than `main`, so there's somewhere to test a change before it reaches the live site.

---

## Suggested order

Items 1 and 2 go together and are the bulk of the work — physical names and the lambdas that reference them have to move at the same time. Item 3 is independent and can happen whenever. Item 4 is a small diff worth doing before any real Prod stage exists. Item 5 is last by definition.
