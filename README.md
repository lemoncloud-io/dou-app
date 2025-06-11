# codes-front-sample

### Project Structure

```plaintext
codes-front-sample/
├── apps/
│   └── web/              # Main application entry point
├── libs/
│   ├── web-core/         # Core authentication and initialization
│   ├── ui-kit/           # Shared UI components library
│   ├── shared/           # Utilities and shared logic
│   └── theme/            # Theme management system
├── scripts/              # Development scripts and configs
├── nx.json               # `nx.json`
└── package.json          # Workspace package manager configuration
```

### Getting Started

#### Prerequisites

-   Node.js (v20 or higher)
-   npm or yarn
-   Git

#### Installation

1. Clone the repository

```bash
$ git clone https://github.com/lemoncloud-io/codes-front-sample.git
$ cd codes-front-sample
```

2. Install dependencies

```bash
$ yarn install
```

3. Set up environment variables

```bash
$ cp apps/web/.env.example apps/web/.env.local
```

4. Start the development server

```
$ yarn web:start
```

The application will be available at http://localhost:5003

### Build

#### Building for Different Environments

The project supports environment-specific builds using different configuration files:

```bash
# Production build
$ yarn web:build:prod

# Development build
$ yarn web:build:dev
```

**Required Environment Files:**

-   `apps/web/.env.prod` - Production environment variables
-   `apps/web/.env.dev` - Development environment variables

Make sure these files exist before running the build commands. You can copy from the example:

```bash
$ cp apps/web/.env.example apps/web/.env.prod
$ cp apps/web/.env.example apps/web/.env.dev
```

#### Build Output

Built files are generated in:

```
dist/apps/web/
```

This directory contains the complete static application ready for deployment.

#### Testing Built Application

To test the production build locally, use `http-server`:

```bash
# Install http-server globally if not already installed
$ npm install -g http-server

# Serve the built application
$ http-server dist/apps/web -p 8080

# Or with specific options
$ http-server dist/apps/web -p 8080 -o --cors
```

The built application will be available at http://localhost:8080

### Tech Stack

-   **Frontend Framework:** React with TypeScript
-   **Project Structure:** Nx Monorepo
-   **Styling:** Tailwind CSS
-   **UI Components:** Radix UI
-   **Internationalization:** i18next

### Contributing

1. Fork the repository
2. Create your feature branch ( git checkout -b feature/amazing-feature )
3. Commit your changes ( git commit -m 'feat: add amazing feature' )
4. Push to the branch ( git push origin feature/amazing-feature )
5. Open a Pull Request
