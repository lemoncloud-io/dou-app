# Docker Deployment

Containerized deployment using **multi-stage builds** for optimized image size and security.

## Quick Start

```bash
# 1. Setup environment
cp .env.docker.example .env.docker

# 2. Deploy via Docker
yarn web:docker:deploy  # → Builds image + deploys to AWS
```

## Configuration

Edit `.env.docker` with your settings:

```bash
# Application
APP_NAME=web
VITE_PROJECT=CODES_SAMPLE_WEB
VITE_ENV=PROD
VITE_HOST=https://your-domain.com

# AWS Configuration
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_BUCKET_NAME=your-s3-bucket
AWS_DEPLOY_TARGET=prod
AWS_DISTRIBUTION_ID=your-cloudfront-id  # Optional

# API Endpoints
VITE_OAUTH_ENDPOINT=https://api.eureka.codes/v1
VITE_SOCIAL_OAUTH_ENDPOINT=https://oauth2.eureka.codes
VITE_IMAGE_API_ENDPOINT=https://image.lemoncloud.io
```

## How It Works

**Multi-stage Docker Build**:

1. **Build stage**: Compile app with all dev dependencies
2. **Deploy stage**: Runtime-only image with AWS CLI + deployment scripts

**Deployment Process**:

```bash
yarn web:docker:deploy
# → Validates .env.docker
# → Builds optimized Docker image
# → Runs container to deploy files to S3
# → Invalidates CloudFront (if configured)
```

## Build-Only Option

```bash
yarn web:docker:build  # Create image without deploying
```

## Troubleshooting

| Issue                          | Solution                                            |
| ------------------------------ | --------------------------------------------------- |
| **Environment file not found** | `cp .env.docker.example .env.docker`                |
| **AWS credentials invalid**    | Check `AWS_ACCESS_KEY_ID` & `AWS_SECRET_ACCESS_KEY` |
| **Docker build fails**         | Ensure Docker daemon running + sufficient resources |
| **S3 sync fails**              | Verify IAM permissions & S3 bucket policies         |

### Debug Mode

```bash
# Run container interactively
docker run -it --rm --env-file .env.docker codes-front-sample:prod /bin/bash

# Then manually run deployment
/app/scripts/docker-entrypoint-deploy.sh
```

## Security Best Practices

-   Never commit `.env.docker` with real credentials
-   Use minimal IAM permissions (S3: PutObject/ListBucket, CloudFront: CreateInvalidation)
-   Rotate AWS keys regularly
-   Consider AWS Secrets Manager for production

## CI/CD Integration

```yaml
# GitHub Actions example
- name: Docker Deploy
  env:
      AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
      AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  run: |
      echo "${{ secrets.ENV_DOCKER }}" > .env.docker
      yarn web:docker:deploy
```

---

**Need traditional deployment?** → See [Deployment Guide](./DEPLOYMENT.md)
