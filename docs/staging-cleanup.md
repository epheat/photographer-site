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
- [ ] **Cognito user pool and client names** — `lib/constructs/ps-auth.ts` lines 22 and 30 build names from `props.stage`, but `lib/ps-backend-stack.ts` line 109 constructs it as `new PSAuth(this, 'ps-auth')` with **no props at all**. The fallback means both stages would be named `photographerWebsiteUsers-Dev`. Pass `{ stage: props.domain }`.

Renaming a DynamoDB table replaces it, which drops the data. Either export and re-import the existing items, or leave the live tables on their current names and prefix only for new stages. Worth deciding deliberately rather than discovering during a deploy.

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
- [ ] **Wire up the user pool values that are already imported but unused.** Lines 76 and 77 do `Fn.importValue(\`userPoolId-${props.domain}\`)` and assign to `userPoolId` / `userPoolClientId` — then nothing reads them. Both bundling paths hardcode the Dev pool instead (lines 82 and 110, local and Docker). The comment there explains why: the values were CDK tokens at the time. Resolving that is the real work; the import is already sitting there waiting.
- [ ] **`frontend/src/main.ts` line 17** — the API endpoint is a hardcoded `execute-api` URL, so every environment's frontend calls the same API. Pass it in as `VUE_APP_API_ENDPOINT` from the website stack's bundling environment, defaulting to the stage's `{domain}.api.evanheaton.com`.

---

## 4. Production safety

- [ ] **`lib/ps-backend-stack.ts` line 87** — the static data bucket is `RemovalPolicy.DESTROY`. Fine for a throwaway dev stage; not what you want holding the only copy of guest photos. Make it stage-dependent, `RETAIN` for Prod.
- [ ] Consider `RemovalPolicy.RETAIN` plus `pointInTimeRecovery` on the Prod tables. PITR is already on for all three.
- [ ] Decide what Dev's data should be. A dev stage that shares the prod Cognito pool isn't a dev stage; once item 1 splits the pools, you'll need a way to seed a test user and grant it the `Admins` group, which is currently created by hand in the console.

---

## 5. Pipeline

- [ ] `bin/infra.ts` — uncomment `ProdStage` and add it to the pipeline, once the above is done.
- [ ] Add a manual approval step before the Prod stage. `lib/ps-pipeline-stack.ts` deploys straight from `main` with no gate.
- [ ] Consider whether Dev should deploy from a branch other than `main`, so there's somewhere to test a change before it reaches the live site.

---

## Suggested order

Items 1 and 2 go together and are the bulk of the work — physical names and the lambdas that reference them have to move at the same time. Item 3 is independent and can happen whenever. Item 4 is a small diff worth doing before any real Prod stage exists. Item 5 is last by definition.
