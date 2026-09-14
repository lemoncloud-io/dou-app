import type { UserView as SocialsUserView } from '@lemoncloud/chatic-socials-api';
import type { UserView as BackendUserView } from '@lemoncloud/chatic-backend-api';
import type { DomainUser } from '../../domain';
import { toDomainUser } from '../../domain';
import type { DataContext } from '../../repositories-v2/types';

/**
 * `toDomainUser` (domain/mappers.ts) is typed against `@lemoncloud/chatic-socials-api`'s
 * `UserView` — the socket axis's shape. The HTTP/OAuth axis's `UserView`
 * (`@lemoncloud/chatic-backend-api`) has a wider `stereo` union (`'#alias'` · `'session'` ·
 * `'#code'` — OAuth-internal markers the socket domain never sees) and otherwise carries the same
 * identity fields (`id`/`name`/…). The two are not structurally assignable, so this bridges them
 * explicitly rather than silently forcing HTTP's shape through the socket-typed mapper.
 *
 * If this ever needs `stereo`-specific branching, that is the signal to give the HTTP axis its own
 * `toDomainUser` instead of reusing the socket one — not to widen the cast further.
 */
export const toDomainUserFromHttp = (view: BackendUserView, context: DataContext): DomainUser =>
    toDomainUser(view as unknown as SocialsUserView, context);
