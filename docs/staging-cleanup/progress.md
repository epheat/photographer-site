# Staging cleanup — execution tracker

Checklist for actually running the migration described in [plan.md](./plan.md#end-to-end-execution-plan). Check items off as they're done in AWS/GitHub, not just coded — several steps are "deploy and confirm healthy," not just "write the CDK."

---

## Phase 0 — prep (pipeline, ships to `DevStage` normally)

- [x] `survivor.ts`/`posts.ts`/other lambdas read table names and pool ID from `process.env`, not hardcoded strings (item 2)
- [x] Static data bucket `RemovalPolicy` is stage-dependent (`RETAIN` for Prod) (item 4)
- [x] Explicit `RemovalPolicy.RETAIN` added to `postsTable` and `gameDataTable`
- [x] Deployed to `DevStage` via pipeline, confirmed healthy

## Phase 1 — extract the shared user pool (mixed pipeline/local)

- [x] Step 1: `RemovalPolicy.RETAIN` added to `UserPool` in `lib/constructs/ps-auth.ts`, deployed via pipeline (no-op — pool already defaulted to Retain)
- [x] Step 2: `UserPool` construct removed from `DevStage`, client points at `fromUserPoolId('us-east-1_TLQmyLdLo')` (pool orphaned). Deployed locally back-to-back to avoid the anticipated client replacement/outage — which turned out not to happen (same resolved pool id → no client replacement)
- [x] Step 3: `PSAuthStack`/`PSAuthStage` defined, pool adopted via local `cdk import` (NOT `--import-existing-resources`, which can't match a pool's generated id), then a normal deploy published the `userPoolId` export
- [x] Step 4: `DevStage`'s literal pool ID swapped for `Fn.importValue('userPoolId')`, deployed (again no client replacement)
- [x] Step 5: `PSAuthStage` added to `delivery.pipeline.addStage(...)` ahead of `devStage`; pipeline green with PSAuthStage sequenced before DevStage
- [x] Confirmed existing users log in against `DevStage` after each step (no auth downtime)

_(Can start the PITR restores below in parallel — they don't touch the live pool.)_

## Phase 2 — bring up `ProdStage`'s backend (local `cdk deploy`)

- [x] PITR restore `PSPosts` → `Prod-PSPosts` (20 items), `PSGameData` → `Prod-PSGameData` (1502 items)
- [x] PITR re-enabled on both restored tables
- [x] `ProdStage` uncommented in `bin/infra.ts` (not yet added to pipeline)
- [x] `cdk deploy ProdStage/ps-backend --import-existing-resources` succeeded — tables imported (UPDATE_COMPLETE, data preserved), everything else created; Prod client `photographerWebsite-Prod` on the shared pool
- [x] Spot-checked API against the restored data — Prod GET /posts returns restored content

## Phase 3 — bring up `ProdStage`'s website, un-aliased (local `cdk deploy`)

- [x] Deployed with no apex `domainNames` — serves on `d21unp9xd2nfs6.cloudfront.net` (aliases null)
- [x] Validated fully via `*.cloudfront.net` URL — deployed bundle carries Prod client + Prod API only; login + data smoke-tested
- [x] Confirmed Dev is still serving the live site throughout
- [x] Item 3 groundwork: frontend config (client id + API endpoint) now threaded per-stage as concrete strings (Option A), not hardcoded Dev values

## Phase 4 — flip Dev (pipeline, ordinary commit to `main`)

- [x] Table rename: `Dev-PSPosts`/`Dev-PSGameData` created fresh+empty (local deploy); old `PSPosts`/`PSGameData` orphaned+retained as rollback; Prod untouched. Dev starts blank (decided: no data copy).
- [ ] Domain change: Dev website → `domainNames: ['dev.evanheaton.com']` (frees the apex) — pending, coupled with Phase 5 cutover
- [ ] Confirmed Dev healthy on its new domain
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
- [x] Decided on Dev seed data: keep posts+recipes (both live in `PSPosts`) — copy `PSPosts` → `Dev-PSPosts` after the rename; `Dev-PSGameData` starts empty (game data not needed in Dev). Execution happens during the Phase 4 Dev cutover.
