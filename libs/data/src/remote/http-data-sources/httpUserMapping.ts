import type { UserView as SocialsUserView } from '@lemoncloud/chatic-socials-api';
import type { UserView as BackendUserView } from '@lemoncloud/chatic-backend-api';
import type { DomainUser } from '../../domain';
import { toDomainUser } from '../../domain';
import type { DataContext } from '../../repositories/types';

export const toDomainUserFromHttp = (view: BackendUserView, context: DataContext): DomainUser =>
    toDomainUser(view as unknown as SocialsUserView, context);
