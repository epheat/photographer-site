// Local dev API server.
//
// Runs the real lambda handlers in-process behind a plain Express server, so you can
// iterate on the backend (and point the frontend at it) without deploying. It translates
// each HTTP request into the APIGatewayProxyEventV2 shape the handlers expect, injects a
// JWT-claims object in place of the API Gateway Cognito authorizer, calls the handler, and
// writes its { statusCode, headers, body } result back to the response.
//
//   npm run dev:api        # starts on http://localhost:3000
//
// `dev:api` bundles this file with esbuild before running it. That's only needed because
// @middy/core (which the handlers import) ships as ESM-only, while the repo root is
// CommonJS for the CDK app — bundling inlines middy so there's no runtime require() of it.
// Re-run `npm run dev:api` to pick up changes (no watcher, to keep the setup small).
//
// It talks to the real Dev-stage DynamoDB/S3, so you need AWS credentials in your
// environment (the same ones `cdk deploy` uses). The Dev tables are disposable by design.
//
// Auth: if the request carries `Authorization: Bearer <jwt>`, the token's claims are
// decoded (NOT verified — this is local only) and used, so a logged-in frontend user's
// sub/groups flow through exactly as in prod. With no token, a fake admin identity is used
// so you can hit admin routes with curl without signing in.

import "./env"; // must come first — see dev/env.ts

import express, { Request, Response } from "express";
import type { Handler } from "aws-lambda";

// Handlers. images/mukhunt both export `getUploadUrl`, so alias on import.
import { getAll, get as getPost, put as putPost, edit as editPost } from "../lib/lambda/posts";
import {
  getCast, setCast, getPredictions, setPrediction, deletePrediction,
  getUserPredictions, getUserPrediction, setUserPrediction, completePrediction,
  getLeaderboard, getUserInventory, getAllInventories, putItem,
} from "../lib/lambda/survivor";
import {
  getUploadUrl as imagesGetUploadUrl, putImageMetadata, getAllImages,
} from "../lib/lambda/images";
import {
  getHunt, putClue, deleteClue, getUploadUrl as mukGetUploadUrl, submitPhoto,
  revealHint, deleteSubmission, getMySubmissions, getAllSubmissions,
} from "../lib/lambda/mukhunt";

const PORT = Number(process.env.PORT ?? 3000);

// A fake identity used when the request has no bearer token. Admins so curl can reach
// admin-only routes; override per-request by sending a real `Authorization: Bearer` header.
const FAKE_CLAIMS = {
  username: "localdev",
  sub: "local-dev-sub",
  "cognito:groups": ["Admins"],
};

// Pull claims out of a `Bearer <jwt>` header by base64-decoding the payload. No signature
// check — fine for local dev, never do this server-side in prod.
function claimsFromAuthHeader(header?: string): Record<string, any> {
  if (!header?.startsWith("Bearer ")) return FAKE_CLAIMS;
  try {
    const payload = header.slice("Bearer ".length).split(".")[1];
    const json = Buffer.from(payload, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return FAKE_CLAIMS;
  }
}

// Build the APIGatewayProxyEventV2(WithJWTAuthorizer) object the handlers read from.
function toEvent(req: Request) {
  const claims = claimsFromAuthHeader(req.headers.authorization);
  const queryStringParameters = Object.fromEntries(
    Object.entries(req.query).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)])
  );
  return {
    version: "2.0",
    routeKey: `${req.method} ${req.path}`,
    rawPath: req.path,
    rawQueryString: "",
    headers: req.headers as Record<string, string>,
    queryStringParameters,
    pathParameters: req.params,
    body: req.body == null ? undefined : (typeof req.body === "string" ? req.body : JSON.stringify(req.body)),
    isBase64Encoded: false,
    requestContext: {
      accountId: "local",
      apiId: "local",
      domainName: `localhost:${PORT}`,
      http: { method: req.method, path: req.path, protocol: "HTTP/1.1", sourceIp: req.ip, userAgent: "" },
      requestId: `local-${Date.now()}`,
      routeKey: `${req.method} ${req.path}`,
      stage: "$default",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
      authorizer: { jwt: { claims, scopes: [] } },
    },
  } as any;
}

// A minimal Lambda context. The @middy/cloudwatch-metrics middleware decorates this with
// `.metrics` before the handler runs; everything else is just plausible stub values.
function makeContext() {
  return {
    awsRequestId: `local-${Date.now()}`,
    functionName: "local-dev",
    functionVersion: "$LATEST",
    invokedFunctionArn: "arn:aws:lambda:us-east-1:000000000000:function:local-dev",
    memoryLimitInMB: "256",
    logGroupName: "/local/dev",
    logStreamName: "local",
    callbackWaitsForEmptyEventLoop: true,
    getRemainingTimeInMillis: () => 30000,
    done: () => {}, fail: () => {}, succeed: () => {},
  } as any;
}

// Wrap a lambda handler as an Express handler.
function lambda(handler: Handler) {
  return async (req: Request, res: Response) => {
    try {
      const result: any = await handler(toEvent(req), makeContext(), () => {});
      if (result == null) return res.status(500).send("handler returned no result");
      if (typeof result === "string") return res.status(200).send(result);
      if (result.headers) {
        for (const [k, v] of Object.entries(result.headers)) res.set(k, String(v));
      }
      return res.status(result.statusCode ?? 200).send(result.body ?? "");
    } catch (err: any) {
      console.error(`[${req.method} ${req.path}]`, err);
      return res.status(500).json({ message: err?.message ?? "local server error" });
    }
  };
}

const app = express();

// CORS: answer the browser's preflight and allow the Authorization header, so the Vue dev
// server at :8080 can call this at :3000. (In prod, API Gateway handles this.)
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Amz-Date,X-Api-Key");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "10mb" }));

// Routes — mirror of the HTTP API in lib/ps-backend-stack.ts.
// posts
app.get("/posts", lambda(getAll));
app.get("/posts/:postId", lambda(getPost));
app.post("/posts/new", lambda(putPost));
app.post("/posts/:postId", lambda(editPost));

// survivor
app.get("/games/survivor/cast", lambda(getCast));
app.post("/games/survivor/cast", lambda(setCast));
app.get("/games/survivor/predictions", lambda(getPredictions));
app.post("/games/survivor/predictions", lambda(setPrediction));
app.post("/games/survivor/predictions/delete", lambda(deletePrediction));
app.get("/games/survivor/userPredictions", lambda(getUserPredictions));
app.get("/games/survivor/userPredictions/:sub", lambda(getUserPrediction));
app.post("/games/survivor/userPredictions", lambda(setUserPrediction));
app.post("/games/survivor/predictions/complete", lambda(completePrediction));
app.get("/games/survivor/leaderboard", lambda(getLeaderboard));
app.get("/games/survivor/userInventory", lambda(getAllInventories));
app.get("/games/survivor/userInventory/:sub", lambda(getUserInventory));
app.post("/games/survivor/items/:sub", lambda(putItem));

// muk hunt
app.get("/games/mukhunt/hunt", lambda(getHunt));
app.post("/games/mukhunt/clues", lambda(putClue));
app.post("/games/mukhunt/clues/delete", lambda(deleteClue));
app.get("/games/mukhunt/uploadUrl/:imageFileName", lambda(mukGetUploadUrl));
app.post("/games/mukhunt/submissions", lambda(submitPhoto));
app.get("/games/mukhunt/submissions", lambda(getMySubmissions));
app.get("/games/mukhunt/submissions/all", lambda(getAllSubmissions));
app.post("/games/mukhunt/submissions/delete", lambda(deleteSubmission));
app.post("/games/mukhunt/hints", lambda(revealHint));

// images
app.get("/images/uploadUrl/:imageFileName", lambda(imagesGetUploadUrl));
app.post("/images/metadata", lambda(putImageMetadata));
app.get("/images/metadata", lambda(getAllImages));

app.listen(PORT, () => {
  console.log(`local dev API on http://localhost:${PORT}`);
  console.log(`  tables: ${process.env.postsTableName}, ${process.env.gameDataTableName}, ${process.env.imageMetadataTableName}`);
  console.log(`  auth:   Bearer token decoded if present, else fake admin (${FAKE_CLAIMS.sub})`);
});
