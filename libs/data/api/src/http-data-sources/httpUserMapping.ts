import type { UserView as SocialsUserView } from '@lemoncloud/chatic-socials-api';
import type { UserView as BackendUserView } from '@lemoncloud/chatic-backend-api';
import type { DomainUser } from '@chatic/data-model';
import { toDomainUser } from '@chatic/data-model';
import type { DataContext } from '@chatic/data-model';

export const toDomainUserFromHttp = (view: BackendUserView, context: DataContext): DomainUser =>
    toDomainUser(view as unknown as SocialsUserView, context);
