import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';
import type { DomainListResult, DomainUser } from '@chatic/data-model';
import { createDomainListResult } from '@chatic/data-model';
import type { DataContext } from '@chatic/data-model';
import type { UserHttpDomainGateway } from '../gateways';
import type { AdminEndpointOptions } from './SubscriptionHttpDataSource';
import { toDomainUserFromHttp } from './httpUserMapping';

export interface IUserHttpDataSource {
    listRelayUsers(
        params: Record<string, unknown> | undefined,
        context: DataContext,
        opts?: AdminEndpointOptions
    ): Promise<DomainListResult<DomainUser>>;
    tryFetchProfile(): Promise<UserProfile$>;
}

export class UserHttpDataSource implements IUserHttpDataSource {
    constructor(private readonly gateway: UserHttpDomainGateway) {}

    async listRelayUsers(
        params: Record<string, unknown> | undefined,
        context: DataContext,
        opts?: AdminEndpointOptions
    ): Promise<DomainListResult<DomainUser>> {
        const result = await this.gateway.list(params, opts);
        const list = result.list.map(view => toDomainUserFromHttp(view, context));
        return createDomainListResult(list, { total: result.total ?? list.length, source: 'remote' });
    }

    tryFetchProfile(): Promise<UserProfile$> {
        return this.gateway.tryProfile();
    }
}
