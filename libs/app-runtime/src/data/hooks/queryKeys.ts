import { createQueryKeys } from '@chatic/shared';

/**
 * The one react-query cache key this package still owns.
 *
 * `session/hooks/auth/useLogin.ts` invalidates the cloud catalog right after a relay login, so the
 * key has to be vocabulary both this lib and the apps can name — the apps' catalog hooks
 * (`apps/web/.../useCloudCatalog.ts`, `apps/desktop-web/.../useCloudCatalog.ts`) query with it.
 * A constants file that imports nothing back, so no cycle.
 *
 * `usersKeys`·`subscriptionKeys`·`productPlansKeys` left with their hooks: nothing in this lib
 * invalidates them, so they are now app-owned (`apps/web/src/app/hooks/queryKeys.ts`,
 * `apps/admin-v2/.../users/api/usersQuery.ts`). Same `createQueryKeys` namespaces, so cache
 * identity is unchanged.
 */
export const cloudsKeys = createQueryKeys('clouds');
