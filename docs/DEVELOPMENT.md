# Development Guide

Daily development workflow and best practices for the codes-front-sample project.

## Essential Commands

```bash
# Development
yarn web:start                  # Dev server → http://localhost:5003
yarn lint:fix                   # Auto-fix code quality issues
yarn web:build:prod             # Production build

# Cache & utilities
yarn clean:cache                # Clear Vite/Nx cache
yarn prettier                   # Format all files
```

## Architecture Overview

**Tech Stack**: React 18.3 • TypeScript • Vite • Nx • Tailwind • Radix UI • Zustand • TanStack Query

### Library Structure & Dependencies

```
apps/web/                  # Main application
├── libs/
│   ├── web-core/         # Auth, API services, core hooks
│   ├── ui-kit/           # Reusable components & styles
│   ├── shared/           # Utils, types, constants
│   └── theme/            # Design system & providers
```

**Import Rules**:

-   `apps/*` → can import any `libs/*`
-   `libs/ui-kit` → can import `shared`, `theme`
-   `libs/web-core` → can import `shared`
-   `libs/shared` → self-contained
-   `libs/theme` → can import `shared`

## Code Quality & Git Workflow

### Nx Generators

```bash
npx nx g @nx/react:component MyComponent --project=ui-kit
npx nx g @nx/react:hook useMyHook --project=web-core
```

### Conventional Commits (required)

```bash
git commit -m "feat(web): add user profile component"
git commit -m "fix(ui-kit): resolve button click issue"
```

**Types**: `feat` | `fix` | `docs` | `refactor` | `test` | `chore`

**Pre-commit hooks** (automatic via Husky):

-   Prettier formatting → ESLint validation → Commit message check

### Testing

```bash
npx nx test web                    # Run tests
npx nx test web --watch            # Watch mode
npx nx test web --coverage         # Coverage report
```

### Library Imports

```typescript
import { Button } from '@lemon/ui-kit';
import { useAuth } from '@lemon/web-core';
import { formatDate } from '@lemon/shared';
import { useTheme } from '@lemon/theme';
```

## Best Practices

### Component Development

```typescript
// TypeScript + Radix UI + Tailwind CSS pattern
interface ButtonProps {
    variant?: 'primary' | 'secondary';
    children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', children }) => (
    <button className={cn('rounded-md font-medium', variants[variant])}>{children}</button>
);
```

### State Management (Zustand)

```typescript
export const useUserStore = create<UserState>()(
    persist(
        set => ({
            user: null,
            setUser: user => set({ user }),
            logout: () => set({ user: null }),
        }),
        { name: 'user-storage' }
    )
);
```

### API Integration (TanStack Query)

```typescript
export const useUserData = (userId: string) =>
    useQuery({
        queryKey: ['user', userId],
        queryFn: () => fetchUser(userId),
        staleTime: 5 * 60 * 1000,
    });
```

### Internationalization (i18next)

```typescript
const { t } = useTranslation();
return <h1>{t('welcome.message')}</h1>;
```

## Development Tools

**Debugging**: React DevTools • Redux DevTools (Zustand) • TanStack Query Devtools
**Performance**: Bundle analyzer via `npx nx build web --stats`

## Troubleshooting

| Issue                | Solution                                        |
| -------------------- | ----------------------------------------------- |
| Port 5003 in use     | `lsof -ti:5003 \| xargs kill -9`                |
| Cache issues         | `yarn clean:cache && rm -rf node_modules/.vite` |
| TypeScript errors    | `npx nx reset`                                  |
| Dependency conflicts | `rm -rf node_modules && yarn install`           |

## Resources

[React](https://react.dev/) • [Nx](https://nx.dev/) • [Tailwind](https://tailwindcss.com/) • [Radix UI](https://www.radix-ui.com/) • [TypeScript](https://www.typescriptlang.org/)

---

**Ready to deploy?** → See [Deployment Guide](./DEPLOYMENT.md)
