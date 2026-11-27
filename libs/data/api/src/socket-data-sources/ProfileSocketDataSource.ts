import type { ProfileView, SiteProfileSyncView } from '@lemoncloud/chatic-socials-api';
import type {
    ProfileGetInput,
    ProfileGetMineInput,
    ProfileSetInput,
    ProfileSyncInput,
} from '@lemoncloud/chatic-sockets-lib';
import type { DomainProfile } from '@chatic/data-model';
import { toDomainProfile } from '@chatic/data-model';
import type { DataContext } from '@chatic/data-model';
import type { ProfileSocketDomainGateway } from '../gateways';

export interface ProfileSyncDomainResult {
    upserts: DomainProfile[];
    removals: string[];
    syncedAt?: number;
}

export interface IProfileSocketDataSource {
    get(payload: ProfileGetInput, context: DataContext): Promise<DomainProfile>;
    getMine(payload: ProfileGetMineInput, context: DataContext): Promise<DomainProfile>;
    set(payload: ProfileSetInput, context: DataContext): Promise<DomainProfile>;
    sync(payload: ProfileSyncInput, context: DataContext): Promise<ProfileSyncDomainResult>;
}

const makeProfileId = (sid: string, uid: string): string => (sid && uid ? `${sid}@${uid}` : '');

export class ProfileSocketDataSource implements IProfileSocketDataSource {
    constructor(private readonly gateway: ProfileSocketDomainGateway) {}

    public async get(payload: ProfileGetInput, context: DataContext): Promise<DomainProfile> {
        const remote = await this.gateway.get<ProfileView>(payload);
        return this.toDomain(remote, context);
    }

    public async getMine(payload: ProfileGetMineInput, context: DataContext): Promise<DomainProfile> {
        const remote = await this.gateway.getMine<ProfileView>(payload);
        return this.toDomain(remote, context);
    }

    public async set(payload: ProfileSetInput, context: DataContext): Promise<DomainProfile> {
        const remote = await this.gateway.set<ProfileView>(payload);
        return this.toDomain(remote, context);
    }

    public async sync(payload: ProfileSyncInput, context: DataContext): Promise<ProfileSyncDomainResult> {
        const remote = await this.gateway.sync<SiteProfileSyncView>(payload);
        const sid = context.sid || '';
        const profiles = (remote?.profiles || {}) as Record<string, Record<string, unknown> | null>;

        const upserts: DomainProfile[] = [];
        const removals: string[] = [];
        for (const [uid, profile] of Object.entries(profiles)) {
            const id = makeProfileId(sid, uid);
            if (!profile) {
                removals.push(id);
                continue;
            }
            upserts.push(this.toDomain({ ...profile, sid, siteId: sid, uid, userId: uid }, context));
        }

        return { upserts, removals, syncedAt: remote?.syncedAt };
    }

    private toDomain(view: unknown, context: DataContext): DomainProfile {
        const source = (view ?? {}) as { siteId?: string; userId?: string };
        const sid = source.siteId || context.sid || '';
        const uid = source.userId || context.uid || '';
        const merged = {
            ...(source as Record<string, unknown>),
            id: makeProfileId(sid, uid),
            sid,
            siteId: sid,
            uid,
            userId: uid,
            cid: context.cid,
        };
        return toDomainProfile(merged as Parameters<typeof toDomainProfile>[0], context);
    }
}
