# codes-front-sample

Modern React application built with **Nx monorepo**, **TypeScript**, and **Tailwind CSS** for scalable enterprise development.

## 🚀 Quick Start

```bash
git clone https://github.com/lemoncloud-io/codes-front-sample.git
cd codes-front-sample
yarn install
cp apps/web/.env.example apps/web/.env.local
yarn web:start  # → http://localhost:5003
```

## 📚 Documentation

Complete guides available in [`docs/`](./docs/):

| Guide                                         | Purpose                             |
| --------------------------------------------- | ----------------------------------- |
| 📖 **[Overview](./docs/README.md)**           | Documentation hub & quick reference |
| 📦 **[Installation](./docs/INSTALLATION.md)** | Setup & prerequisites               |
| 💻 **[Development](./docs/DEVELOPMENT.md)**   | Workflow & best practices           |
| 🚀 **[Deployment](./docs/DEPLOYMENT.md)**     | AWS S3/CloudFront deployment        |
| 🐳 **[Docker](./docs/DOCKER.md)**             | Container-based deployment          |

## ⚡ Essential Commands

```bash
# Development
yarn web:start         # Dev server (port 5003)
yarn lint:fix          # Auto-fix linting
yarn web:build:prod    # Production build

# Deployment
yarn web:deploy:prod   # → AWS S3 + CloudFront
yarn web:docker:deploy # → Containerized deployment
```

## 🏗️ Architecture

**Stack**: React 18.3 • TypeScript • Vite • Nx • Tailwind CSS • Radix UI • Zustand • TanStack Query

```
codes-front-sample/
├── apps/web/              # Main React app
├── libs/                  # Shared libraries
│   ├── web-core/         # Auth & core logic
│   ├── ui-kit/           # UI components
│   ├── shared/           # Utilities
│   └── theme/            # Theme system
├── scripts/              # Deployment scripts
└── docker/               # Container configs
```

**Infrastructure**: AWS S3 + CloudFront • GitHub Actions CI/CD • Docker deployment

## 🤝 Contributing

1. Fork & create feature branch: `git checkout -b feature/name`
2. Follow [conventional commits](https://conventionalcommits.org/): `git commit -m "feat: description"`
3. Run tests & linting: `yarn lint:fix`
4. Open Pull Request

See [Development Guide](./docs/DEVELOPMENT.md) for complete guidelines.

## 📄 License

MIT License
