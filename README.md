<p align="center">
  <img src="assets/src/logo/logo.png" alt="DoU Logo" width="120" />
</p>

<h1 align="center">DoU</h1>

<p align="center">
  <strong>A full-stack, cross-platform messaging & community app built with React, React Native, and Nx</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/React_Native-0.83-61DAFB?logo=react&logoColor=white" alt="React Native 0.83" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.9" />
  <img src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white" alt="Vite 7" />
  <img src="https://img.shields.io/badge/Nx-22-143055?logo=nx&logoColor=white" alt="Nx 22" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License" />
</p>

---

## Overview

DoU is a monorepo containing **4 applications** and **15 shared libraries**, powering a real-time messaging and community platform across web, mobile, and admin interfaces.

| App         | Description                      | Stack                              |
| ----------- | -------------------------------- | ---------------------------------- |
| **Web**     | Main user-facing web app         | React 19 + Vite + Tailwind CSS     |
| **Admin**   | Admin dashboard                  | React 19 + Vite + Tailwind CSS     |
| **Mobile**  | iOS & Android native app         | React Native 0.83 + WebView bridge |
| **Landing** | Landing page & deep link handler | React 19 + Vite                    |

## Key Features

- Real-time messaging via WebSocket
- Multi-provider authentication (OAuth, Apple, Google)
- Push notifications (Firebase Cloud Messaging)
- In-App Purchases (iOS & Android subscriptions)
- Places / location-based community
- Deep linking (iOS Universal Links & Android App Links)
- Dark / light theme with system preference detection
- Internationalization (i18n) with language auto-detection
- Onboarding flow with guided steps

## Tech Stack

| Category         | Technology                             |
| ---------------- | -------------------------------------- |
| **Framework**    | React 19, React Native 0.83            |
| **Language**     | TypeScript 5.9 (strict mode)           |
| **Build**        | Vite 7, Metro 0.83, Nx 22              |
| **Styling**      | Tailwind CSS 3.4, Radix UI (shadcn/ui) |
| **State**        | Zustand 5, TanStack Query 5            |
| **Routing**      | React Router 6, React Navigation 7     |
| **Forms**        | React Hook Form 7                      |
| **i18n**         | i18next 25                             |
| **Testing**      | Vitest 4, Jest 29, Testing Library     |
| **Code Quality** | ESLint 9, Prettier, Husky, Commitlint  |

## Project Structure

```
dou-app/
├── apps/
│   ├── web/                 # Main web application (port 5003)
│   ├── admin/               # Admin dashboard (port 5001)
│   ├── mobile/              # React Native app (iOS + Android)
│   │   ├── android/
│   │   ├── ios/
│   │   └── src/
│   └── landing/             # Landing page (port 5004)
├── libs/
│   ├── web-core/            # Auth, API client, initialization
│   ├── ui-kit/              # Shared UI components (shadcn/ui)
│   ├── shared/              # Common utilities and hooks
│   ├── theme/               # Theme provider (dark/light)
│   ├── auth/                # Authentication logic
│   ├── channels/            # Channel management
│   ├── chats/               # Chat functionality
│   ├── places/              # Location-based features
│   ├── socket/              # WebSocket integration
│   ├── pouches/             # API utilities and hooks
│   ├── users/               # User management
│   ├── app-messages/        # Messaging types and stores
│   ├── device-utils/        # Device info and stores
│   ├── deeplinks/           # Deep linking utilities
│   └── i18n-mobile/         # Mobile i18n setup
├── assets/                  # Shared images, logos, icons
├── scripts/                 # Build and deployment scripts
├── docs/                    # Documentation
└── .github/workflows/       # CI/CD pipelines
```

## Getting Started

### Prerequisites

- **Node.js** >= 22
- **Yarn** 1.x
- **Xcode** (for iOS development)
- **Android Studio** (for Android development)
- **CocoaPods** (for iOS dependencies)

### Installation

```bash
# Clone the repository
git clone https://github.com/lemoncloud-io/dou-app.git
cd dou-app

# Install dependencies
yarn install
```

### Environment Setup

Copy the example environment files and fill in your values:

```bash
# Web
cp apps/web/.env.example apps/web/.env

# Admin
cp apps/admin/.env.example apps/admin/.env

# Landing
cp apps/landing/.env.example apps/landing/.env

# Mobile
cp apps/mobile/.env.example apps/mobile/.env
```

For mobile Firebase configuration:

```bash
# iOS - copy and fill with your Firebase config
cp apps/mobile/ios/Firebase/GoogleService-Info.plist.example \
   apps/mobile/ios/Firebase/GoogleService-Info-Dev.plist

# Android - copy and fill with your Firebase config
cp apps/mobile/android/app/src/google-services.json.example \
   apps/mobile/android/app/src/dev/google-services.json
```

### Development

```bash
# Web app (http://localhost:5003)
yarn web:start

# Admin dashboard (http://localhost:5001)
yarn admin:start

# Landing page (http://localhost:5004)
yarn landing:start

# Mobile - Start Metro bundler
yarn mobile:start

# Mobile - Run iOS simulator
yarn mobile:ios

# Mobile - Run Android emulator
yarn mobile:android
```

### Building

```bash
# Build individual apps
yarn web:build:dev        # or yarn web:build:prod
yarn admin:build:dev      # or yarn admin:build:prod
yarn landing:build:dev    # or yarn landing:build:prod

# Build all apps at once
yarn build:all:dev        # or yarn build:all:prod
```

### Mobile-Specific Commands

```bash
# iOS
yarn mobile:pod                         # Install CocoaPods
yarn mobile:ios:dev:release:simulator   # Dev release on simulator
yarn mobile:ios:dev:release:device      # Dev release on device

# Android
yarn mobile:android:build:apk:dev      # Build dev APK
yarn mobile:android:build:apk:prod     # Build prod APK
yarn mobile:android:build:aab:dev      # Build dev AAB (Play Store)
yarn mobile:android:build:aab:prod     # Build prod AAB (Play Store)
```

## Code Quality

```bash
# Lint
yarn lint              # Check for issues
yarn lint:fix          # Auto-fix issues

# Format
yarn prettier          # Format all files
yarn prettier:staged   # Format staged files only

# Test
npx nx test web        # Test specific project
npx nx test            # Test all projects
```

Pre-commit hooks (via Husky) automatically run linting and formatting on staged files. Commit messages are enforced with [Conventional Commits](https://www.conventionalcommits.org/) via Commitlint.

## Architecture

### Shared Library System

All apps share code through `@chatic/*` path aliases:

```typescript
import { useAuth } from '@chatic/web-core';
import { Button } from '@chatic/ui-kit';
import { useWebSocket } from '@chatic/socket';
import { ThemeProvider } from '@chatic/theme';
```

### State Management Pattern

- **Server state**: TanStack Query for caching, background refetching, and optimistic updates
- **Client state**: Zustand stores for auth, theme, device info, and UI state
- **Local state**: React `useState` / `useReducer` for component-scoped data

### Mobile Architecture

The mobile app uses a **WebView + Native Bridge** pattern:

1. React Native shell provides native capabilities (push notifications, IAP, contacts, camera)
2. Web app runs inside a WebView
3. A bridge layer enables bidirectional communication between native and web

## Deployment

Deployment scripts are provided for AWS S3 + CloudFront:

```bash
# Deploy to development
yarn web:deploy:dev
yarn admin:deploy:dev
yarn landing:deploy:dev

# Deploy to production
yarn web:deploy:prod
yarn admin:deploy:prod
yarn landing:deploy:prod
```

Required environment variables for deployment:

| Variable                         | Description                       |
| -------------------------------- | --------------------------------- |
| `DEPLOY_BUCKET_NAME`             | S3 bucket name                    |
| `DEPLOY_DEV_CF_DISTRIBUTION_ID`  | CloudFront distribution ID (dev)  |
| `DEPLOY_PROD_CF_DISTRIBUTION_ID` | CloudFront distribution ID (prod) |

CI/CD is configured via GitHub Actions with automated deployment on branch push.

## Documentation

- [Deep Linking Setup](docs/DEEP-LINKING.md) - iOS Universal Links & Android App Links configuration

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/) (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
