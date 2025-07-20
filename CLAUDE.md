# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Service Overview - Chatic

Chatic is a next-generation messenger where each user's personal AI assistant naturally participates in conversations. Unlike traditional messengers, Chatic enables AI to understand conversation context, provide real-time assistance, and execute actual tasks through external service integrations.

### Core Concept

-   **AI-Integrated Messaging**: Each user has their own AI assistant that can be invoked during conversations
-   **Context-Aware Assistance**: AI understands the flow of conversation and provides relevant help
-   **Action Execution**: Beyond information provision, AI can execute tasks (calendar integration, delivery orders, reservations)
-   **Privacy-First Design**: Each AI only accesses its owner's data, activated only through explicit commands

### Key Features

1. **Personalized AI Configuration**

    - Custom trigger words (e.g., "Hey Siri", "Jarvis")
    - Personality settings (formal/casual, emoji usage)
    - Granular permission controls

2. **Smart Conversation Enhancement**

    - Context-based responses
    - Conversation history analysis
    - Relationship pattern insights
    - Conflict resolution assistance

3. **External Service Integration**

    - Google Calendar synchronization
    - Food delivery platform integration
    - Weather and search capabilities
    - Automated routine execution

4. **Transparent Usage-Based Billing**
    - Pay-as-you-go model
    - Real-time usage tracking
    - Monthly billing with usage caps

## Development Requirements

### Technical Stack

-   **Backend**: FastAPI (Python 3.11+) with async/await
-   **Real-time**: WebSocket (Socket.io) + Redis Pub/Sub
-   **Database**: PostgreSQL (primary) + Redis (cache) + TimescaleDB (analytics)
-   **AI Integration**: LangChain + OpenAI/Claude API
-   **Task Queue**: Celery + Redis
-   **Frontend**: React Native (mobile-first)
-   **Authentication**: JWT + OAuth 2.0

### Performance Requirements

-   Message latency: < 100ms (P99)
-   AI response initiation: < 2 seconds
-   Concurrent users: 10,000+
-   Message throughput: 100,000 msg/min
-   System availability: 99.9%

### Security Requirements

-   End-to-end encryption (optional)
-   API rate limiting
-   DDoS protection
-   PII data encryption
-   Audit logging

## Essential Commands

### Development

```bash
yarn web:start                  # Start development server on port 5003
yarn clean:cache               # Clear Vite and Nx caches before starting
```

### Building

```bash
yarn web:build:dev             # Build for development environment
yarn web:build:prod            # Build for production environment
```

### Code Quality

```bash
yarn lint                      # Run ESLint across all projects
yarn lint:fix                  # Fix linting issues automatically
yarn prettier                  # Format all code files
yarn test                      # Run tests with Jest
```

### Deployment

```bash
yarn web:deploy:dev            # Build and deploy to dev environment
yarn web:deploy:prod           # Build and deploy to production
```

### Testing Individual Files

```bash
npx nx test [project] --testFile=[filename]    # Run specific test file
npx nx test web --watch                        # Run tests in watch mode
```

## Architecture Overview

This is an Nx monorepo with a modular React/TypeScript application using Vite as the build tool.

### Key Architectural Decisions

1. **Monorepo Structure**: Uses Nx for efficient builds and dependency management

    - `apps/web/`: Main React application
    - `libs/`: Shared libraries across the workspace

2. **Library Organization**:

    - `libs/web-core/`: Authentication and app initialization (@lemoncloud/lemon-web-core integration)
    - `libs/ui-kit/`: Reusable UI components built on Radix UI primitives
    - `libs/shared/`: Common utilities, hooks, and TypeScript types
    - `libs/theme/`: Centralized theme management
    - `assets/`: Shared static assets

3. **Feature-Based Architecture** in `apps/web/src/app/`:

    - `features/`: Domain-specific modules (auth, home, landing)
    - `routes/`: Route definitions with guards
    - `shared/`: Cross-feature components

4. **State Management**: Zustand stores with persistence

    - Located in feature-specific directories
    - Uses zustand-persist for local storage

5. **API Integration**:

    - Axios for HTTP requests
    - React Query (TanStack Query) for server state management
    - API clients organized by feature

6. **Styling System**:

    - Tailwind CSS for utility-first styling
    - Radix UI for accessible component primitives
    - class-variance-authority (CVA) for component variants
    - Theme system in `libs/theme/`

7. **Form Handling**: React Hook Form with Zod validation

8. **Internationalization**: i18next with multiple backends

    - Translations in `apps/web/src/i18n/`
    - Supports language detection and caching

9. **Routing**: React Router v6 with protected routes

    - Route guards for authentication
    - Centralized route definitions

10. **Build Configuration**:
    - Vite for fast development and optimized builds
    - Environment-specific builds using `.env.dev` and `.env.prod`
    - TypeScript path aliases configured in `tsconfig.base.json`

## Important Technical Details

-   **Port**: Development server runs on port 5003
-   **Node Version**: Requires Node.js v20 or higher
-   **Package Manager**: Uses Yarn (not npm)
-   **Commit Convention**: Enforces conventional commits with commitlint
-   **Code Formatting**: Prettier with 120 char width, 4-space tabs, single quotes
-   **Pre-commit Hooks**: Husky runs linting and formatting on staged files
-   **Import Order**: ESLint enforces specific import ordering
-   **Component Patterns**: Follow existing patterns in `libs/ui-kit/` when creating new components
-   **Authentication**: Handled by @lemoncloud/lemon-web-core package

## Environment Setup

Before building, ensure environment files exist:

```bash
cp apps/web/.env.example apps/web/.env.local  # For local development
cp apps/web/.env.example apps/web/.env.dev    # For dev builds
cp apps/web/.env.example apps/web/.env.prod   # For prod builds
```
