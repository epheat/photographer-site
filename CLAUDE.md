# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal website (evanheaton.com) with a Vue 3 frontend and AWS CDK infrastructure. Features include blog posts, a Fantasy Survivor game, and a Phaser-based tower defense game.

## Build Commands

### Root (CDK Infrastructure)
- `npm run build` - Compile TypeScript CDK code
- `npm run test` - Run Jest tests (in `test/` directory)
- `npm run clean` - Clean build artifacts and cdk.out
- `cdk synth` - Synthesize CloudFormation templates
- `cdk deploy` - Deploy stacks to AWS
- `cdk diff` - Compare deployed vs local state

### Frontend (Vue 3)
- `cd frontend && npm run serve` - Development server with hot reload
- `cd frontend && npm run build` - Production build
- `cd frontend && npm run lint` - ESLint with auto-fix

## Architecture

### Two-Stack CDK Application
The app entry point is `bin/infra.ts`, which creates a `PSAppStage` containing:

1. **PSBackendStack** (`lib/ps-backend-stack.ts`): API Gateway HTTP API with Lambda integrations, DynamoDB tables, S3 bucket, Cognito authentication
2. **PSWebsiteStack** (`lib/ps-website-stack.ts`): CloudFront distribution, S3 bucket for static assets, builds and deploys the Vue frontend

### Lambda Functions
Located in `lib/lambda/`:
- `posts.ts` - Blog post CRUD operations
- `survivor.ts` - Fantasy Survivor game logic (predictions, leaderboard, inventory)
- `images.ts` - Image upload/metadata management
- `auth.ts`, `responses.ts`, `middleware.ts` - Shared utilities

### Frontend Structure
Vue 3 app in `frontend/` using Vue Router with hash history. Key directories:
- `src/pages/` - Route components (Home, Posts, Games, Survivor, BattleTD, Auth, Editor)
- `src/components/` - Reusable Vue components
- `src/phaser/` - Phaser 3 game code (BattleTD tower defense)
- `src/auth/` - Authentication utilities

Authentication is handled via AWS Amplify connecting to Cognito. The API endpoint and Cognito IDs are configured in `main.ts` and injected as environment variables during build.

### Data Storage
- **PSPosts** DynamoDB table - Blog posts with GSI for type/date sorting
- **PSGameData** DynamoDB table - Fantasy Survivor game data (cast, predictions, inventory)
- **EHImageMetadata** DynamoDB table - Image metadata
- S3 bucket for static data and images