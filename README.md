# evanheaton.com

Personal website built with Vue 3 and deployed on AWS via CDK. Features a blog, a Fantasy Survivor game, a Phaser-based tower defense game, and a recipe manager.

Live at **evanheaton.com** · API at **api.evanheaton.com**

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vue 3, Vue Router, Phaser 3, AWS Amplify |
| Backend | AWS Lambda (Node.js/TypeScript) |
| API | API Gateway HTTP API |
| Auth | Amazon Cognito |
| Storage | DynamoDB, S3 |
| Infrastructure | AWS CDK v2 (TypeScript) |

---

## Project Structure

```
├── bin/infra.ts           # CDK app entry point
├── lib/
│   ├── ps-backend-stack.ts   # API, Lambda, DynamoDB, Cognito
│   ├── ps-website-stack.ts   # CloudFront + S3 static hosting
│   ├── constructs/           # Reusable CDK constructs
│   └── lambda/               # Lambda function handlers
│       ├── posts.ts          # Blog post CRUD
│       ├── survivor.ts       # Fantasy Survivor game logic
│       └── images.ts         # Image upload & metadata
├── frontend/
│   └── src/
│       ├── pages/            # Route-level Vue components
│       ├── components/       # Shared UI components
│       ├── phaser/           # BattleTD tower defense game
│       └── auth/             # Cognito auth utilities
└── test/                  # CDK infrastructure tests (Jest)
```

---

## Features

- **Blog** — markdown posts stored in DynamoDB, rendered with `marked`
- **Fantasy Survivor** — predictions, leaderboard, and inventory system
- **BattleTD** — Phaser 3 tower defense game
- **Recipes** — recipe editor with draggable ingredient sections
- **Image management** — S3-backed uploads with metadata indexing

---

## Getting Started

### Prerequisites

- Node.js 18+
- AWS CLI configured with deploy permissions
- AWS CDK CLI: `npm install -g aws-cdk`

### Frontend (local dev)

```bash
cd frontend
npm install
npm run serve        # http://localhost:8080
```

### Infrastructure

```bash
npm install
npm run build        # compile CDK TypeScript
cdk diff             # preview changes
cdk deploy           # deploy to AWS
```

### Tests

```bash
npm test             # CDK infrastructure tests
cd frontend && npm run lint   # frontend lint
```

---

## Infrastructure

Two CDK stacks deployed under a single `PSAppStage`:

**PSBackendStack** — API Gateway HTTP API with JWT authorizer (Cognito), Lambda integrations, three DynamoDB tables (`PSPosts`, `PSGameData`, `EHImageMetadata`), and an S3 bucket for static data and image storage.

**PSWebsiteStack** — CloudFront distribution fronting an S3 bucket. Builds the Vue app during `cdk deploy` and syncs the output to S3.

The frontend connects to the API and Cognito via environment variables injected at build time.
