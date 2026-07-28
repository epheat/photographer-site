# Muk Hunt

A photo scavenger hunt around Mukilteo, WA for the weekend of **July 17, 2027**. Guests get a list of clues, each worth points based on difficulty (selfies preferred), and submit a photo from their phone for each one. Photos are auto-accepted. Afterward the photos get compiled into a photo-album blog post on the site.

This document is the implementation plan. Most of it is assembling patterns that already exist in the repo — the Fantasy Survivor game on `PSGameData`, the presigned-S3-upload pattern with `EHImageMetadata`, Cognito auth, and markdown blog posts. The one genuinely new piece is **an upload path ordinary logged-in users can use**; today's `/images/uploadUrl` is Admins-only and keys everything under `images/`.

### Design decisions

- Photos are publicly readable from upload (the bucket policy extends to `muk-hunt/*`).
- Players see **only their own** progress and photos — no leaderboard or shared gallery. Points are still tracked per user so standings can be shown later.
- Clues are created, edited, and deleted through an **Admins-only tab** on the Muk Hunt page.
- The **hunt record itself is inserted by hand** into DynamoDB. Only one hunt is planned, so there's no create-hunt API or admin form.
- Re-submitting a photo for a clue **replaces** it; points are unchanged.

---

## 1. Data model

### PSGameData

Table keys: PK `entityId`, SK `resourceId`; GSIs `resourceTypeIndex` (PK `resourceType`, SK `resourceId`) and `pointsIndex` (PK `resourceId`, SK `points`).

Hunt id is the string `"2027"`, giving `MukHunt-2027` as the game entity — the same shape as `FantasySurvivor-<seasonId>`. It lives as a module constant `HUNT_ID` in the lambda; a future hunt is a one-line change plus a new DB row, which is cheaper than an active-pointer indirection for a single event.

| Record | entityId | resourceId | Attributes |
|---|---|---|---|
| Hunt *(inserted by hand)* | `MukHunt-<huntId>` | `Hunt` | `title`, `description`, `startDate`/`endDate` (epoch ms), `resourceType: "Hunt"` |
| Clue | `MukHunt-<huntId>` | `Clue-<clueId>` | `title`, `description`, `points` (N), `selfie` (bool), `sortOrder` (N), `resourceType: "Clue"` |
| Submission | `<cognito sub>` | `MukHunt-<huntId>-Submission-<clueId>` | `clueId`, `imageId`, `imageUrl`, `caption?`, `pointsAwarded` (N), `author`, `submittedDate`, `updatedDate`, `status: "ACCEPTED"`, `resourceType: "MukHuntSubmission"` |
| UserPoints | `<cognito sub>` | `MukHunt-<huntId>-UserPoints` | `points` (N), `pointHistory[]`, `author`, `resourceType: "MukHuntUserPoints"` |

This mirrors the survivor conventions in `lib/lambda/survivor.ts`: game-owned rows keyed by the game entity, user-owned rows keyed by cognito sub with a game-prefixed sort key, and a shared literal `resourceId` on UserPoints so `pointsIndex` can produce sorted standings later.

Name the submission attribute **`pointsAwarded`, not `points`**. `pointsIndex` has `points` as its sort key, so an attribute named `points` on every submission row would pull them all into the index for no reason.

`getHunt` loads the hunt and all its clues in **one** query on `entityId = MukHunt-<huntId>`, splitting items by `resourceId` prefix in the handler. If the Hunt row is missing, return a clear 400 rather than crashing.

**The hunt row to insert manually**, once, before anything else works — via the DynamoDB console or `aws dynamodb put-item`:

```json
{
  "entityId": "MukHunt-2027",
  "resourceId": "Hunt",
  "resourceType": "Hunt",
  "title": "Muk Hunt 2027",
  "description": "A photo scavenger hunt around Mukilteo, WA.",
  "startDate": 1815552000000,
  "endDate": 1815724799000
}
```

The dates above are placeholders standing in for Fri Jul 16 2027 17:00 PT through Sun Jul 18 2027 23:59 PT — compute the real epoch ms when inserting. Widening the window later is just an item edit.

**Points idempotency:** on submit, read UserPoints; if `pointHistory` already contains `event === "Clue-<clueId>"`, don't add points, because this is a replacement. Otherwise add `clue.points` and append history. Same guard `completePrediction` uses in `lib/lambda/survivor.ts` (around line 536).

### EHImageMetadata

Unchanged in shape — one row per uploaded object: `imageId` (PK), `createdDate`, `author`, `authorSub`, `s3Url`, `ttl`, plus `caption`, `huntId`, `clueId` added and `ttl` removed on finalize. **No new GSI.** The album query and any future standings both come off the existing `resourceTypeIndex` on PSGameData:

```
resourceType = "MukHuntSubmission" AND begins_with(resourceId, "MukHunt-2027")
```

No scan, no new infrastructure — the same idiom as `getUserPredictions` in survivor.ts.

---

## 2. Backend — new `lib/lambda/mukhunt.ts`

Style follows `lib/lambda/images.ts` rather than survivor.ts: middy handlers, `requireGroup("Admins")` from `lib/lambda/middleware.ts`, `cloudwatchMetrics` (namespace `PS-MukHunt-API`, dimension `Operation`), and table/bucket names read from `process.env`. Reuse `getUserInfo`/`userHasGroup` from `lib/lambda/auth.ts` and `success`/`error`/`deny`/`fault` from `lib/lambda/responses.ts`.

All routes carry the shared `HttpUserPoolAuthorizer`. The API's CORS config allows only OPTIONS/GET/POST, so deletes are modeled as `POST .../delete`, matching the rest of the codebase.

| Handler | Route | Method | Auth | Shape |
|---|---|---|---|---|
| `getHunt` | `/games/mukhunt/hunt` | GET | JWT | → `{hunt, clues[]}` |
| `putClue` | `/games/mukhunt/clues` | POST | Admins | `{clue:{clueId?,title,description,points,selfie,sortOrder}}` → `{clueId}`; server generates the uuid when absent, so one handler both creates and edits |
| `deleteClue` | `/games/mukhunt/clues/delete` | POST | Admins | `{clueId}` |
| `getUploadUrl` | `/games/mukhunt/uploadUrl/{imageFileName}` | GET | **JWT (any logged-in user)** | `?contentType=` → `{imageId, uploadUrl, imageUrl}` |
| `submitPhoto` | `/games/mukhunt/submissions` | POST | JWT | `{clueId, imageId, caption?}` → `{submission, totalPoints}` |
| `getMySubmissions` | `/games/mukhunt/submissions` | GET | JWT | → `{submissions[], userPoints}` |
| `getAllSubmissions` | `/games/mukhunt/submissions/all` | GET | Admins | → `{submissions[]}`, the album source |

### `getUploadUrl`

Muk-hunt-specific rather than a reuse of `images.getUploadUrl`. Two things make reuse impossible regardless: it's wrapped in `requireGroup("Admins")`, and it hardcodes the `images/` key prefix. Beyond that, the existing flow has defects worth not inheriting (below). Writing our own costs roughly 40 duplicated lines but leaves the editor and recipe upload flows untouched. A later refactor could extract a shared `presignImageUpload({keyPrefix, contentType, ttlSeconds})` into `lib/lambda/images-common.ts`.

Behavior:

1. Sanitize the filename: `decodeURIComponent(name).replace(/[^a-zA-Z0-9._-]/g, "_")`.
2. Validate `contentType` against `image/jpeg|png|webp|heic|heif|gif`, defaulting to `image/jpeg`.
3. Key: `muk-hunt/${sub}/${Date.now()}_${sanitized}`.
4. Presign `PutObjectCommand` **with `ContentType`**, `expiresIn: 300`.
5. Write the EHImageMetadata row with `ttl = now + 86400` (24 hours).

### Defects in the existing upload flow

These are the reasons Muk Hunt writes its own presign handler and its own client-side upload code rather than copying what's there.

| # | Where | Problem | What Muk Hunt does |
|---|---|---|---|
| 1 | `lib/lambda/images.ts` line 41, `frontend/src/pages/EditorPage.vue` line 100 | The presign omits `ContentType` and the client PUTs `Content-Type: multipart/form-data`. Every uploaded image is stored in S3 with that content type, so browsers may download it instead of rendering it. | Sign with `ContentType`; client sends `file.type`. |
| 2 | `lib/lambda/images.ts` line 39 | The filename is interpolated raw into the S3 key with no sanitizing, and the client never `encodeURIComponent`s it. Spaces and `#` break the request; a `/` silently rewrites the key prefix. iPhone names like `IMG_0123 (1).HEIC` are exactly this case. | Encode client-side, sanitize server-side. |
| 3 | `lib/lambda/images.ts` line 55 | Writes `ttl` = +120s, but the table never had `timeToLiveAttribute` enabled, so it's inert and orphaned presign rows accumulate forever. Enabling TTL as-is would be worse: 120s can reap a row before the upload finishes. | 24-hour ttl, plus enabling TTL on the table (§3). |
| 4 | `lib/lambda/images.ts` line 90 | `delete getResult.Item!.ttl` with no null check — an unknown `imageId` throws a TypeError and returns a 500 where a 400 belongs. | Null-check the item, return 400. |
| 5 | `lib/lambda/images.ts` line 92 | No ownership check on finalize: any admin can overwrite any image's metadata. Harmless while writes are admin-only; not harmless once every guest can call it. | `deny()` unless `authorSub === sub`. |
| 6 | `lib/lambda/images.ts` line 45 | `expiresIn: 120` is tight for a phone on cell service uploading a multi-megabyte photo. | 300s. |
| 7 | `frontend/src/pages/EditorPage.vue` line 97 | `uploadResponse.ok` is never checked; a failed PUT still reports success and writes metadata. | Check `ok`, surface the failure. |

Separately, `GET /images/metadata` is wired to `handler: 'getAllImages'` in the stack, but `getAllImages` is never exported from images.ts, so the route 500s on every call. Nothing consumes it, which is why it has gone unnoticed. Out of scope here, but it is the failure mode the export checklist in §7 guards against.

### `submitPhoto`

1. Load the hunt record and check the window: `startDate <= now <= endDate`, bypassed for Admins so the hunt can be tested before the weekend.
2. Load the clue; 400 if missing.
3. Load the EHImageMetadata row by `imageId`; null-check it, and `deny()` if `authorSub !== sub` so nobody can submit someone else's upload.
4. Finalize the metadata row: add `caption`, `huntId`, `clueId`, `updatedDate`; delete `ttl`.
5. Unconditional `put` of the submission row — replacement is just an overwrite.
6. Idempotent UserPoints update per §1.

---

## 3. CDK — `lib/ps-backend-stack.ts`

1. **Seven `NodejsFunction`s** after the images block, `entry: ./lambda/mukhunt.ts`, `handler: '<exportName>'`, environment `{gameDataTableName, imageMetadataTableName, staticDataBucketName}`.
   - `gameDataTable.grantReadData`: getHunt, getMySubmissions, getAllSubmissions
   - `gameDataTable.grantReadWriteData`: putClue, deleteClue, submitPhoto
   - getUploadUrl also needs `imageMetadataTable.grantReadWriteData` and `staticDataBucket.grantReadWrite`
   - submitPhoto also needs `imageMetadataTable.grantReadWriteData`
2. **Seven routes** after the survivor routes, all with the shared `authorizer`.
3. **Bucket policy** — a new statement beside the existing `AllowPublicAccessForImagesPath`:
   ```ts
   staticDataBucket.addToResourcePolicy(new iam.PolicyStatement({
     sid: "AllowPublicAccessForMukHuntPath",
     effect: iam.Effect.ALLOW,
     principals: [ new iam.AnyPrincipal() ],
     actions: [ 's3:GetObject' ],
     resources: [ `${staticDataBucket.bucketArn}/muk-hunt/*` ]
   }));
   ```
4. **Enable TTL on EHImageMetadata**: add `timeToLiveAttribute: 'ttl'` to the table definition. The lambdas already write `ttl`, but TTL was never enabled, so it does nothing. Muk Hunt will generate abandoned presign rows at scale as people fumble uploads on phones, and both finalize paths delete `ttl`, so completed rows are never at risk. It's an additive change with no table replacement. Do it as its own commit, together with the 24-hour ttl value — enabling TTL against the current 120-second value would race the finalize call.

Leave the broken `getAllImages` wiring alone; it's out of scope. Just don't copy the pattern.

---

## 4. Frontend

New files:

| File | Purpose |
|---|---|
| `frontend/src/pages/MukHuntPage.vue` | The game page; modeled on `SurvivorGamePage.vue` |
| `frontend/src/components/mukhunt/ClueCard.vue` | One clue in the list, with completed state |
| `frontend/src/components/mukhunt/SubmitPhotoModal.vue` | Camera capture, preview, caption, upload |
| `frontend/src/assets/mukhunt_logo.png` | Placeholder game logo |

Edits: add `{ path: '/games/MukHunt', component: MukHuntPage }` to `frontend/src/router/router.ts`, and a third `.game-container` card to `frontend/src/pages/GamesPage.vue`. The Navbar needs no change — its Games link already covers it.

**Page structure** (options API, scoped SCSS importing the `colors` and `sizes` partials, breakpoints `$phone: 600px` / `$tablet: 800px`): tabs for Hunt / My Photos / Admin, the last with `v-if="shouldShowAdminPage"` from `authStore.state.isAdmin`, plus the logged-out info banner with login and register links copied from SurvivorGamePage. API calls use the existing per-call amplify pattern with a freshly fetched bearer token.

**Hunt tab** — hunt title and description, the event window, a progress line ("3/10 clues · 45 pts"), then a `ClueCard` per clue showing title, points badge, a "Selfie!" badge when `clue.selfie`, the description, and a check plus thumbnail once completed. Tapping opens the submit modal, which is disabled outside the window unless you're an admin.

**SubmitPhotoModal** — the mobile-critical piece. Built on the shared `Modal.vue`, `Button.vue` (which emits `press`, not `click`), `FormField.vue`, and `Spinner.vue`:

- `<input type="file" accept="image/*" :capture="clue.selfie ? 'user' : 'environment'">` styled as a large "Take photo" button. `capture` opens the camera directly on phones, front-facing for selfie clues, and degrades to a file picker on desktop.
- Local preview via `URL.createObjectURL(file)`, revoked on close, plus the optional caption field.
- Submit state machine `idle → uploading → submitting → done | error`:
  1. `GET /games/mukhunt/uploadUrl/${encodeURIComponent(file.name)}?contentType=${encodeURIComponent(file.type)}`
  2. `fetch(uploadUrl, {method:"PUT", headers:{"Content-Type": file.type || "image/jpeg"}, body: file})` — the real content type. Since the presign signs ContentType, copying EditorPage's hardcoded `multipart/form-data` would 403. Check `response.ok`.
  3. `POST /games/mukhunt/submissions` with `{clueId, imageId, caption}`, then merge the response into local state.
- When a submission already exists for the clue, the modal reads "Replace your photo" and notes that points won't change.

**My Photos tab** — a grid of the player's own submissions, one column at `$phone` and two or three above: photo, clue title, caption, points, and a Replace button. Total points at the top.

**Admin tab** — clue management only. A list of clues with Edit and Delete per row (delete behind a confirm modal), a create/edit form (title, description, points, selfie checkbox, sortOrder), and the album button below. No hunt-settings form: the hunt row and its dates are managed by hand in DynamoDB, and the tab just displays the configured window read-only.

---

## 5. Album compilation

Deliberately lightweight — no new post type, no scripts. An admin "Copy album markdown" button in the Admin tab fetches `GET /games/mukhunt/submissions/all`, groups submissions by clue in `sortOrder`, and emits:

```
## <Clue title> (<points> pts)
![<caption or author>](<imageUrl>)
*<author> — <caption>*
```

into a read-only textarea, plus `navigator.clipboard.writeText`. Paste that into the existing `/posts/new` editor as a normal `TEXT` post — `marked` renders it, and `PostPage.vue` already styles embedded images via `::v-deep(img)`. A first-class `PHOTO_ALBUM` postType would mean touching both validation branches in posts.ts plus `Post.vue`, which calls `content.substring` and would throw on a post without content. Not worth it.

---

## 6. Later, optional: Bedrock classification

The only concession the first version makes to this is the `status: "ACCEPTED"` attribute on submissions. Later, entirely additively: `submitPhoto` writes `PENDING` and awards no points, then async-invokes (`InvocationType: "Event"`) a `classifySubmission` handler that reads the object from S3, calls Bedrock's Converse API with a vision-capable Claude model, passes the clue text plus the selfie hint, and parses `{match, confidence, reason}`. On `ACCEPTED` it runs the same idempotent points update; on `REJECTED` it stores a reason the UI shows with a retake prompt. Needs `bedrock:InvokeModel` on that one lambda. Fail open on Bedrock errors — it's a family game, not a bank.

---

## 7. Verification

- `npm run build` (tsc catches lambda type errors) and `npx cdk synth` — confirm seven new Lambda functions and routes, the `AllowPublicAccessForMukHuntPath` statement, and `TimeToLiveSpecification` on EHImageMetadata. Then `npm test`, and `npm run lint` in `frontend/`.
- **Export checklist:** for each of the seven `handler:` strings in the stack, confirm a matching `export const` exists in mukhunt.ts. The broken `getAllImages` route is exactly this mistake.
- **Dev end-to-end:** insert the dev hunt row by hand with a window covering today. As an admin, add two or three clues (one selfie) and exercise clue edit and delete. As a non-admin test user, see the clues, submit a photo, and verify the object lands at `muk-hunt/<sub>/…` and is fetchable in an incognito tab with the right Content-Type; verify points award once; resubmit and verify the photo swaps while points hold; check My Photos. Then set the window in the past and confirm a non-admin submit is rejected while an admin bypasses it; confirm `submissions/all` 403s for non-admins; generate the album markdown and paste it into a draft post.
- **Mobile:** devtools at 375px for layout, but `capture` behavior and HEIC handling only show up on a real device — do one pass on an actual phone against dev.

---

## 8. Implementation order

1. `lib/lambda/mukhunt.ts` with `getHunt`; stack lambda and route. Synth, deploy dev, insert the dev hunt row by hand.
2. Admin clue writes: `putClue`, `deleteClue`, plus wiring.
3. Upload and submit path: `getUploadUrl`, `submitPhoto`, `getMySubmissions`, `getAllSubmissions`, plus the `muk-hunt/*` bucket policy.
4. Enable `timeToLiveAttribute: 'ttl'` on EHImageMetadata (isolated commit).
5. Frontend scaffold: route, GamesPage card and logo, MukHuntPage tabs, ClueCard.
6. SubmitPhotoModal and the My Photos tab.
7. Admin tab clue CRUD.
8. Album markdown button.
9. Polish and the end-to-end pass in §7, including a real phone.
10. *(Later branch)* Bedrock classification.

---

## 9. Risks and gotchas

- **Content-Type must match the presign.** Signing with `ContentType` means the browser PUT has to send the identical header; the existing `multipart/form-data` hardcode would 403.
- **HEIC.** iPhone library picks can be `image/heic`, which won't render outside Safari or in the album. Accept it for now — camera capture generally yields JPEG — with a client-side canvas re-encode as the mitigation if it becomes a problem.
- **TTL timing.** Only enable table TTL alongside the 24-hour value; against the current 120 seconds it could reap rows before finalize.
- **`pointsIndex` pollution.** `points` belongs only on UserPoints rows.
- **UserPoints read-modify-write race.** Two near-simultaneous submits for different clues could drop a history entry. Survivor has the same exposure; acceptable at this scale, fixable with a `ConditionExpression` if it ever matters.
- **authStore is copied into `data()` at mount**, so logging in after mount doesn't update the page. Existing site-wide behavior, just don't be surprised by it.
- **The admin window bypass is deliberate** (for testing), so "closed" doesn't mean closed for you.
