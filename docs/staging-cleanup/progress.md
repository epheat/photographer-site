# Staging cleanup — execution tracker

Checklist for actually running the migration described in [plan.md](./plan.md#end-to-end-execution-plan). Check items off as they're done in AWS/GitHub, not just coded — several steps are "deploy and confirm healthy," not just "write the CDK."

---

## Phase 0 — prep (pipeline, ships to `DevStage` normally)

- [ ] `survivor.ts`/`posts.ts`/other lambdas read table names and pool ID from `process.env`, not hardcoded strings (item 2)
- [ ] Static data bucket `RemovalPolicy` is stage-dependent (`RETAIN` for Prod) (item 4)
- [ ] Explicit `RemovalPolicy.RETAIN` added to `postsTable` and `gameDataTable`
- [ ] Deployed to `DevStage` via pipeline, confirmed healthy

## Phase 1 — extract the shared user pool (mixed pipeline/local)

- [ ] Step 1: `RemovalPolicy.RETAIN` added to `UserPool` in `lib/constructs/ps-auth.ts`, deployed to `DevStage` via pipeline
- [ ] Step 2: `UserPool` construct removed from `DevStage`, client temporarily points at `fromUserPoolId('us-east-1_TLQmyLdLo')`, deployed via pipeline (pool now orphaned)
- [ ] Step 3: `PSAuthStack` defined, adopted via local/CI `cdk deploy --import-existing-resources`
- [ ] Step 4: `DevStage`'s literal pool ID swapped for `Fn.importValue('userPoolId')`, deployed via pipeline
- [ ] Step 5: `PSAuthStage` added to `delivery.pipeline.addStage(...)` ahead of `devStage`
- [ ] Confirmed existing users/`Admins` group still work against `DevStage` post-migration

_(Can start the PITR restores below in parallel — they don't touch the live pool.)_

## Phase 2 — bring up `ProdStage`'s backend (local `cdk deploy`)

- [ ] PITR restore `PSPosts` → `Prod-PSPosts`, `PSGameData` → `Prod-PSGameData`
- [ ] PITR re-enabled on both restored tables
- [ ] `ProdStage` uncommented in `bin/infra.ts` (not yet added to pipeline)
- [ ] `cdk deploy ProdStage/ps-backend --import-existing-resources` succeeded
- [ ] Spot-checked API against the restored data

## Phase 3 — bring up `ProdStage`'s website, un-aliased (local `cdk deploy`)

- [ ] Deployed with no apex `domainNames` (or a throwaway subdomain)
- [ ] Validated fully via `*.cloudfront.net` URL
- [ ] Confirmed Dev is still serving the live site throughout

## Phase 4 — flip Dev (pipeline, ordinary commit to `main`)

- [ ] `DevStage` deploy covering: prefixed table names (`Dev-PSPosts`/`Dev-PSGameData`) + `domainNames: ['dev.evanheaton.com']`
- [ ] Confirmed Dev healthy on its new table names and new domain
- [ ] Confirmed apex aliases are now free (no distribution holds them)

## Phase 5 — cut Prod over to the apex (local `cdk deploy` + manual DNS)

- [ ] `ProdStage` website stack redeployed with `domainNames: ['evanheaton.com', 'www.evanheaton.com']`
- [ ] Route53 apex `ARecord` flipped to Prod's distribution
- [ ] Out-of-band `www.evanheaton.com` record found and repointed to Prod
- [ ] Cutover done off-peak, downtime window observed and accepted
- [ ] `evanheaton.com` confirmed serving from Prod

## Phase 6 — hand Prod to the pipeline (pipeline structure change)

- [ ] `delivery.pipeline.addStage(prodStage, { pre: [...] })` added, with manual approval gate wired in
- [ ] First pipeline-driven deploy to `ProdStage` confirmed working end-to-end
- [ ] (Independent, whenever) Decided whether Dev deploys from a non-`main` branch

## Phase 7 — cleanup

- [ ] Original unprefixed `PSPosts`/`PSGameData` tables deleted
- [ ] Decided on Dev seed data (or confirmed fine starting blank)
