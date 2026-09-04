## Login updates
Reduce the password restrictions to make it easier for users to sign up. Make the password restrictions clear from the get go and apply client-side validation before attempting to submit.

Refresh the look and feel of the login, sign-up, and forgot password pages/flows to better match the rest of the site.
For example, they should extend to the full max-width on desktop.

---

## Redirect back to the originating page after login

**Current behavior:** every entry point into `/auth/login` is a static link — `NavAuth.vue:4-5`, and the inline "this game requires an account" banners in `SurvivorGamePage.vue:10` and `MukHuntPage.vue:15`. None of them know what page the user was on. `AuthPage.vue`'s `onSubmit()` (the login handler) always does `this.$router.push('/')` on success (`AuthPage.vue:104`), so a user who clicks Login from `/games/MukHunt` lands on the homepage instead of back where they started.

**Design:** carry the originating path as a `redirect` query param on `/auth/:flowRoute`, and consume it only at the point the user actually becomes authenticated.

- Every link into the auth flow becomes a bound `:to` instead of a static string, e.g. `{ path: '/auth/login', query: { redirect: $route.fullPath } }`. Applies to `NavAuth.vue`'s Login/Register links and the two inline banners.
- `AuthPage.vue`'s internal flow transitions (`register` → `confirm`, `forgor` → `forgor2`, `confirm`/`forgor2` → `login`) currently do `this.$router.push({ path: 'confirm' })` etc. — a relative push, resolved against the current `/auth/:flowRoute` segment (verified against the installed vue-router 4.4.5: `/auth/register` + `{ path: 'confirm' }` → `/auth/confirm`). That part's fine, but the query string is **not** carried along automatically — confirmed by testing the same push in isolation, `?redirect=...` gets dropped. Each of those five pushes needs `query: this.$route.query` added so `redirect` survives register→confirm→login and forgot→forgot2→login before finally reaching the login form.
- In `onSubmit()`'s success branch, replace the hardcoded `this.$router.push('/')` with a resolved redirect target: `this.$route.query.redirect`, falling back to `/`.
- Sanity-check the redirect value before using it — only accept a path that starts with `/` and not `//` (rules out an accidental external/protocol-relative redirect via a hand-crafted `?redirect=` link). `router.push` won't actually navigate off-site regardless since it resolves against the app's own routes, but the check makes the intent explicit and is cheap.
- Out of scope, noticed in passing: `onReset()` (the `NEW_PASSWORD_REQUIRED` challenge path, `AuthPage.vue:110-124`) calls `Auth.currentUserPoolUser()`/`Auth.changePassword()`, which need an already-authenticated session — that's a different API than completing a `NEW_PASSWORD_REQUIRED` challenge, and it never navigates or sets `authStore` on success. Looks like a pre-existing gap unrelated to the redirect work; not touching it here.

## Remove the `#` from URLs (switch off hash history)

**Current behavior:** `router.ts:1,37` uses `createWebHashHistory()`, with a `// TODO: don't use hash history` already sitting next to it. Hash mode was the easy default because the fragment after `#` never reaches the server — the browser always requests `/` (or `/index.html`), so a static S3+CloudFront host doesn't need to know about client-side routes at all.

**Why it can't just flip to `createWebHistory()`:** with real paths, a direct hit or refresh on `/posts/5` sends that literal path to CloudFront → S3. `lib/ps-website-stack.ts`'s `Distribution` (`:48-57`) has no `errorResponses`, and the bucket is private behind Origin Access Control with `blockPublicAccess: BLOCK_ALL` — S3 can't tell CloudFront "no such key" from "not authorized" when the origin has no `s3:ListBucket` grant, so a missing key comes back as a 403, not a 404. Either way, right now that error would just show CloudFront's default error page instead of the Vue app.

**Design:**
1. **`lib/ps-website-stack.ts`** — add `errorResponses` to the `Distribution`, rewriting both 403 and 404 to `/index.html` with `responseHttpStatus: 200`, so every deep link falls through to the SPA and `vue-router` takes over client-side. This is the standard S3+CloudFront SPA pattern.
2. **`frontend/src/router/router.ts`** — swap `createWebHashHistory()` for `createWebHistory()`. Default base (`/`) is correct — `frontend/vue.config.js` sets no `publicPath` override, so the build already assumes root-served assets.
3. **`lib/lambda/survivor.ts:781`** — the Fantasy Survivor prediction-reminder email hardcodes `https://evanheaton.com/#/games/FantasySurvivor`. Needs to drop the `#` or it'll land users on `/` instead of the game page once hash routing is gone. Grepped for other `#/`-style hardcoded links; this is the only one (`lib/lambda/survivor.js` is the compiled output of the same file — don't hand-edit it, it regenerates on build).
4. **Known tradeoff, not fixed:** anyone with an old bookmark or shared link in the `evanheaton.com/#/posts/5` shape will, post-switch, land on the CloudFront-served `/` (the fragment never reaches the server and the app no longer parses `location.hash` for routing) instead of their intended page. Low-traffic personal site, so acceptable — worth a one-line note if it ever comes up, but not worth a compatibility shim up front.

**Order of operations matters:** deploy the CloudFront `errorResponses` change *before or together with* the router switch — never the router switch alone — otherwise every deep link and every refresh on a non-root route 403s until the infra catches up.