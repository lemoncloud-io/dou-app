# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Development

- `yarn web:start` - Start web development server on port 5003
- `yarn admin:start` - Start admin development server on port 5001
- `yarn mobile:start` - Start mobile Metro bundler
- `yarn mobile:ios` - Run iOS simulator
- `yarn mobile:android` - Run Android emulator

### Build Commands

- `yarn web:build:dev` - Build web for development environment
- `yarn web:build:prod` - Build web for production environment
- `yarn admin:build:dev` - Build admin for development environment
- `yarn admin:build:prod` - Build admin for production environment
- `yarn build:all:dev` - Build all projects for development
- `yarn build:all:prod` - Build all projects for production

### Deployment

- `yarn web:deploy:dev` - Deploy web to development environment
- `yarn web:deploy:prod` - Deploy web to production environment

### Code Quality

- `yarn lint` - Run ESLint across all projects
- `yarn lint:fix` - Run ESLint with auto-fix
- `yarn prettier` - Format code with Prettier
- `yarn prettier:staged` - Format only staged files

### Testing

- `npx nx test [project-name]` - Run tests for specific project
- `npx nx test` - Run all tests

### Utilities

- `yarn clean:cache` - Clear build caches

### Environment Setup

Before building, ensure environment files exist:

- `apps/web/.env.dev` - Development environment variables
- `apps/web/.env.prod` - Production environment variables
- Copy from `apps/web/.env.example` if needed

## Architecture Overview

### Monorepo Structure (Nx Workspace)

This is an Nx monorepo with the following key structure:

**Applications:**

- `apps/web/` - Primary React web application
- `apps/admin/` - Admin React web application
- `apps/mobile/` - React Native mobile application (iOS + Android)

**Shared Libraries:**

- `libs/web-core/` - Core authentication, API client, and initialization logic
- `libs/ui-kit/` - Shared UI components built on Radix UI primitives (shadcn/ui)
- `libs/shared/` - Common utilities, hooks, and shared logic
- `libs/theme/` - Theme management system with dark/light mode support
- `libs/pouches/` - API utilities and hooks
- `libs/app-messages/` - Messaging types and stores
- `libs/device-utils/` - Device-related hooks and stores
- `assets/` - Shared images and logos

### Technology Stack

- **Framework:** React 19 with TypeScript
- **Mobile:** React Native 0.83
- **Build Tool:** Vite with Nx
- **Styling:** Tailwind CSS
- **UI Components:** Radix UI primitives (shadcn/ui)
- **State Management:** Zustand
- **Routing:** React Router v6
- **Data Fetching:** TanStack Query (React Query)
- **Form Handling:** React Hook Form with Hookform Resolvers
- **Internationalization:** i18next
- **Testing:** Jest and Vitest

### Key Patterns

**State Management:**

- Zustand stores for global state (auth, user profile)
- TanStack Query for server state management
- Local component state for UI-specific data

**Component Architecture:**

- Feature-based organization over file-type organization
- Shared UI components in `libs/ui-kit`
- Business logic in custom hooks
- Error boundaries for resilient UX

**Import Organization:**

ESLint enforces strict import ordering:

1. React and external libraries
2. Internal `@chatic/*` packages
3. Relative imports
4. Type imports (separate section)

### Development Notes

**Environment Configuration:**

- Web development server runs on port 5003
- Admin development server runs on port 5001
- Environment-specific builds require corresponding `.env` files
- Built files output to `dist/apps/[app-name]/`

**Code Style:**

- TypeScript strict mode enabled
- ESLint with custom rules for import ordering and unused imports
- Prettier for consistent formatting (4-space indentation)
- Husky git hooks for pre-commit checks

**Path Aliases:**

- `@chatic/web-core` - Core library
- `@chatic/ui-kit` - UI components
- `@chatic/shared` - Shared utilities
- `@chatic/theme` - Theme provider
- `@chatic/pouches` - API utilities
- `@chatic/app-messages` - Messaging
- `@chatic/device-utils` - Device utilities
- `@chatic/assets` - Assets
