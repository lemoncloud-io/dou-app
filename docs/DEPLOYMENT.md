# Deployment Guide

Static site deployment to **AWS S3 + CloudFront** with automated CI/CD.

```
GitHub/Local → AWS S3 Bucket → CloudFront CDN → Global Users
```

## Prerequisites

### AWS Setup

1. **S3 bucket**: `codes-front-sample` (or your preferred name)
2. **CloudFront distributions**: dev & prod (optional)
3. **AWS CLI**: `aws configure --profile lemon`
4. **IAM permissions**: S3 (PutObject, ListBucket) + CloudFront (CreateInvalidation)

## Configuration

### 1. Update Scripts

Edit `scripts/deploy-web.sh`:

```bash
BUCKET_NAME=your-bucket-name
DEV_DISTRIBUTION_ID=your-cloudfront-id      # Optional
PROD_DISTRIBUTION_ID=your-cloudfront-id     # Optional
```

### 2. Environment Files

```bash
# Create environment-specific files
cp apps/web/.env.example apps/web/.env.dev
cp apps/web/.env.example apps/web/.env.prod

# Key variables:
# VITE_ENV=DEV|PROD
# VITE_HOST=https://your-domain.com
# VITE_OAUTH_ENDPOINT=https://api.eureka.codes/v1
```

## Manual Deployment

```bash
# Development
yarn web:deploy:dev     # Build → S3 upload → CloudFront invalidation

# Production
yarn web:deploy:prod    # Build → S3 upload → CloudFront invalidation
```

## Automated Deployment (CI/CD)

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
    push:
        branches: [main, develop] # main=prod, develop=dev

jobs:
    deploy:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - uses: actions/setup-node@v4
              with: { node-version: '20' }

            - run: yarn install
            - run: yarn web:build:prod # or :dev based on branch

            - uses: aws-actions/configure-aws-credentials@v4
              with:
                  aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
                  aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
                  aws-region: ap-northeast-2

            - run: ./scripts/deploy-web.sh prod # or dev based on branch
```

**Required GitHub Secrets**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

## AWS Infrastructure Details

### S3 Bucket Structure

```
codes-front-sample/
├── dev/                # Development environment
│   ├── index.html     # No cache
│   ├── assets/        # Long cache (1 year)
│   └── locales/       # No cache (dynamic)
└── prod/              # Production environment
```

### CloudFront Setup

-   **Origins**: `bucket.s3.amazonaws.com` with path `/dev` or `/prod`
-   **Behaviors**: HTTPS redirect, compression enabled
-   **Error Pages**: 404/403 → `/index.html` (SPA routing)

### Cache Strategy

-   **index.html**: `max-age=0, must-revalidate`
-   **JS/CSS/Assets**: `max-age=31536000` (1 year, versioned filenames)
-   **Locales**: `max-age=0` (no cache for translations)

## Troubleshooting

| Issue                       | Solution                                |
| --------------------------- | --------------------------------------- |
| **AWS CLI not configured**  | `aws configure --profile lemon`         |
| **S3 Access Denied**        | Check IAM permissions & bucket policies |
| **CloudFront not updating** | Wait 5-10 min for invalidation          |
| **Build failures**          | `yarn clean:cache && rm -rf dist`       |

### Debug Commands

```bash
# Check S3 upload
aws s3 ls s3://codes-front-sample/prod/ --recursive --profile lemon

# Test direct S3 access
curl https://codes-front-sample.s3.amazonaws.com/prod/index.html
```

## Security & Optimization

**Security**: Never commit `.env` files • Use IAM roles with minimal permissions • Enable CloudFront logs
**Cost**: Enable S3 lifecycle policies • Use appropriate CloudFront cache TTLs • Monitor with AWS Cost Explorer

## Production Checklist

-   [ ] Tests passing
-   [ ] Environment variables configured
-   [ ] Build succeeds without errors
-   [ ] Rollback procedure tested
-   [ ] Team notified

---

**Need Docker deployment?** → See [Docker Guide](./DOCKER.md)
