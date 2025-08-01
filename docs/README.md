# Documentation Hub

## 📋 Quick Reference

### Getting Started (5 minutes)

```bash
yarn install
cp apps/web/.env.example apps/web/.env.local
yarn web:start  # → http://localhost:5003
```

### Development Workflow

```bash
yarn web:start         # Dev server
yarn lint:fix          # Code quality
yarn web:build:prod    # Production build
```

### Deployment Options

```bash
yarn web:deploy:prod   # AWS S3 + CloudFront
yarn web:docker:deploy # Docker deployment
```

## 📚 Complete Guides

| Guide                                    | When to Use              | Time Required   |
| ---------------------------------------- | ------------------------ | --------------- |
| **[📦 Installation](./INSTALLATION.md)** | First-time setup         | 10-15 min       |
| **[💻 Development](./DEVELOPMENT.md)**   | Daily development        | Reference       |
| **[🚀 Deployment](./DEPLOYMENT.md)**     | Production releases      | 30-45 min setup |
| **[🐳 Docker](./DOCKER.md)**             | Containerized deployment | 20-30 min setup |

## 🛠️ Technology Stack

**Frontend**: React 18.3 • TypeScript • Vite • Nx monorepo
**Styling**: Tailwind CSS • Radix UI components\
**State**: Zustand • TanStack Query • React Router
**Quality**: ESLint • Prettier • Husky • Jest
**Deploy**: AWS S3 + CloudFront • Docker • GitHub Actions

## 🏗️ Project Structure

```
codes-front-sample/
├── apps/web/              # Main React application
├── libs/
│   ├── web-core/         # Authentication & API
│   ├── ui-kit/           # Reusable components
│   ├── shared/           # Utilities & types
│   └── theme/            # Design system
├── scripts/              # Deployment automation
└── docker/               # Container configs
```

## 🆘 Quick Help

**Installation Issues** → [INSTALLATION.md troubleshooting](./INSTALLATION.md#common-installation-issues)\
**Development Questions** → [DEVELOPMENT.md guide](./DEVELOPMENT.md#troubleshooting)\
**Deployment Problems** → [DEPLOYMENT.md help](./DEPLOYMENT.md#troubleshooting)\
**Docker Issues** → [DOCKER.md debugging](./DOCKER.md#troubleshooting)

## 📞 Support

Create GitHub issue with:

-   Environment details (OS, Node.js version)
-   Complete error message
-   Steps to reproduce
