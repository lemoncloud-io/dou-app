# Installation Guide

## Prerequisites

Ensure you have the following installed:

### Required Software

| Software    | Version | Installation                        |
| ----------- | ------- | ----------------------------------- |
| **Node.js** | 20.0.0+ | [nodejs.org](https://nodejs.org/)   |
| **Yarn**    | Latest  | `npm install -g yarn`               |
| **Git**     | Latest  | [git-scm.com](https://git-scm.com/) |

### Optional (for deployment)

| Tool        | Purpose                  | Setup                                                                    |
| ----------- | ------------------------ | ------------------------------------------------------------------------ |
| **AWS CLI** | S3/CloudFront deployment | [Install](https://aws.amazon.com/cli/) → `aws configure --profile lemon` |

## Installation Steps

### 1. Clone Repository

```bash
git clone https://github.com/lemoncloud-io/codes-front-sample.git
cd codes-front-sample
```

### 2. Install Dependencies

```bash
yarn install  # Installs React 18.3, Nx, Tailwind, TypeScript, etc.
```

### 3. Environment Setup

```bash
# Create local environment file
cp apps/web/.env.example apps/web/.env.local

# Edit .env.local with your settings:
# VITE_ENV=LOCAL
# VITE_PROJECT=CODES_SAMPLE_WEB
# VITE_OAUTH_ENDPOINT=https://api.eureka.codes/d1
# VITE_HOST=http://localhost:5003
```

### 4. Verify Installation

```bash
yarn web:start  # → http://localhost:5003
```

**That's it!** Git hooks (Husky) are automatically configured during `yarn install`.

## Common Installation Issues

| Issue                       | Solution                                                  |
| --------------------------- | --------------------------------------------------------- |
| **Node version mismatch**   | `nvm install 20 && nvm use 20`                            |
| **Permission errors**       | `yarn cache clean && rm -rf node_modules && yarn install` |
| **Port 5003 in use**        | `lsof -i :5003` → kill process or use different port      |
| **Husky hooks not working** | `rm -rf .husky && yarn prepare`                           |

## Next Steps

✅ **Installation complete!** → Continue to [Development Guide](./DEVELOPMENT.md)\
🚀 **Ready to deploy?** → See [Deployment Guide](./DEPLOYMENT.md)\
🐳 **Need Docker?** → Check [Docker Guide](./DOCKER.md)
