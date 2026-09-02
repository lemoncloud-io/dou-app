import { createQueryKeys } from '@chatic/shared';

/**
 * react-query cache keys owned by THIS app.
 *
 * These used to live in `@chatic/app-runtime`'s `data/hooks/queryKeys.ts` together with the REST
 * hooks. The hooks came down to the app layer (ADR-0070 결정 5, ②안 방향) and the keys followed —
 * a cache key is part of a cache policy, and the cache is the app's.
 *
 * `cloudsKeys` deliberately did NOT move: `useLogin` (still in the runtime) invalidates the cloud
 * catalog right after a relay login, so that one key is shared vocabulary between the lib and the
 * apps and stays exported from `@chatic/app-runtime`.
 */
export const subscriptionKeys = createQueryKeys('subscriptions');
export const productPlansKeys = createQueryKeys('productPlans');
