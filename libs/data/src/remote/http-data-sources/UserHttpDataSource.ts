import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';
import type { DomainListResult, DomainUser } from '../../domain';
import { createDomainListResult } from '../../domain';
import type { DataContext } from '../../repositories/types';
import type { UserHttpDomainGateway } from '../gateways';
import { toDomainUserFromHttp } from './httpUserMapping';

export interface IUserHttpDataSource {
    listRelayUsers(
        params: Record<string, unknown> | undefined,
        context: DataContext
    ): Promise<DomainListResult<DomainUser>>;
    /** No-retry profile probe — errors bubble, same as the gateway (caller decides fallback). */
    tryFetchProfile(): Promise<UserProfile$>;
}

/**
 * Relay user listing · profile probe. No local cache — `data`'s admin user list and profile probe
 * have no cache slot today, and HTTP reads never auto-write the local cache.
 */
export class UserHttpDataSource implements IUserHttpDataSource {
    constructor(private readonly gateway: UserHttpDomainGateway) {}

    async listRelayUsers(
        params: Record<string, unknown> | undefined,
        context: DataContext
    ): Promise<DomainListResult<DomainUser>> {
        const result = await this.gateway.list(params);
        const list = result.list.map(view => toDomainUserFromHttp(view, context));
        return createDomainListResult(list, { total: result.total ?? list.length, source: 'remote' });
    }

    tryFetchProfile(): Promise<UserProfile$> {
        return this.gateway.tryProfile();
    }
}
