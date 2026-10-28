// Default environment for the local dev API server (see dev/server.ts).
//
// Imported FIRST, before any lambda handler module, because the handlers read these
// process.env values at module load time to construct their DynamoDB/S3 clients. ESM
// evaluates imported modules in source order, so keeping this as server.ts's first
// import guarantees the defaults are set before the handlers are evaluated.
//
// Defaults point at the disposable Dev stage resources. Override any of them by
// exporting the variable before `npm run dev:api` (e.g. to run against DynamoDB Local).

process.env.AWS_REGION ??= "us-east-1";

// DynamoDB tables (Dev stage)
process.env.postsTableName ??= "Dev-PSPosts";
process.env.gameDataTableName ??= "Dev-PSGameData";
process.env.imageMetadataTableName ??= "Dev-EHImageMetadata";

// S3 bucket for images / static data (Dev stage). posts/images use `imageDataBucketName`,
// mukhunt uses `staticDataBucketName`; both point at the same bucket.
process.env.imageDataBucketName ??= "dev-eh-website-static-data";
process.env.staticDataBucketName ??= "dev-eh-website-static-data";

// Cognito user pool (only used by sendPredictionReminders, which isn't routed here).
process.env.userPoolId ??= "us-east-1_TLQmyLdLo";
