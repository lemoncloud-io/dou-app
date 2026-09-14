import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';
import type { RegisterDeviceResult } from '@lemoncloud/chatic-pushes-api';
import type { DomainListResult, DomainUser } from '../../domain';
import { createDomainListResult } from '../../domain';
import type { DataContext } from '../../repositories-v2/types';
import type { UserHttpDomainGateway } from '../gateways';
import { toDomainUserFromHttp } from './httpUserMapping';

/**
 * Split out from `IUserHttpDataSource` so `DeviceRepositoryV2` can take exactly the surface it
 * uses (ADR-0070 결정 5 규율 2 — consumer takes only the interface it needs), same shape as
 * `AuthHttpDataSource`/`DeviceSocketDataSource` on the socket side.
 */
export interface IDeviceRegistrationHttpSource {
    registerPushDevice(body: Record<string, unknown>, opts?: { force?: boolean }): Promise<RegisterDeviceResult>;
}

export interface IUserHttpDataSource extends IDeviceRegistrationHttpSource {
    listRelayUsers(
        params: Record<string, unknown> | undefined,
        context: DataContext
    ): Promise<DomainListResult<DomainUser>>;
    /** No-retry profile probe — errors bubble, same as the gateway (caller decides fallback). */
    tryFetchProfile(): Promise<UserProfile$>;
    updateProfileHttp(uid: string, body: Record<string, unknown>): Promise<UserProfile$>;
}

/**
 * Relay user listing · profile probe/edit · push device registration. No local cache — `data`'s
 * admin user list and profile probe have no cache slot today, and device registration is a
 * one-shot command (ADR-0070 결정 5 원칙 6 — HTTP reads do not auto-write local cache).
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

    updateProfileHttp(uid: string, body: Record<string, unknown>): Promise<UserProfile$> {
        return this.gateway.updateProfile(uid, body);
    }

    registerPushDevice(body: Record<string, unknown>, opts?: { force?: boolean }): Promise<RegisterDeviceResult> {
        return this.gateway.registerDevice(body as never, opts);
    }
}
