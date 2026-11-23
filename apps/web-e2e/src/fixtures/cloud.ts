import { SocketRefusal, type FakeBackend, type HttpHandler, type SocketHandler } from './backend';
import { GUEST } from './guest';
import { MINA } from './rooms';
import { signedInMember } from './subscription';

export const CLOUD = {
    id: '1000099',
    name: 'E2E Cloud',
    backend: 'https://c1.e2e.test/api',
    wss: 'wss://c1-ws.e2e.test/cht',
    defaultSite: '0000',
} as const;

export const CLOUD_PLACE = { id: '10001', name: 'Design Team' } as const;

export const CLOUD_NICK = 'Kim in Design';

export const CLOUD_ROOM = {
    id: 'e2e-cloud-room',
    name: 'Design Review',
    stereo: '',
    sid: CLOUD_PLACE.id,
    $: { sid: CLOUD_PLACE.id },
    ownerId: MINA.uid,
    memberNo: 2,
    chatNo: 0,
    createdAt: GUEST.createdAt,
    updatedAt: GUEST.createdAt,
};

export const SECOND_PLACE = { id: '10002', name: 'Marketing' } as const;

export const SECOND_PLACE_ROOM = {
    ...CLOUD_ROOM,
    id: 'e2e-cloud-room-2',
    name: 'Campaign Sync',
    sid: SECOND_PLACE.id,
    $: { sid: SECOND_PLACE.id },
};

export const CLOUD_USER = { uid: '2000001', accountId: 'C.e2e.invitee' } as const;

const base64Url = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

const cloudIdentityToken = (sid: string): string =>
    [
        base64Url({ alg: 'none', typ: 'JWT' }),
        base64Url({
            cid: CLOUD.id,
            sid,
            gid: null,
            uid: CLOUD_USER.uid,
            aid: `${CLOUD_USER.uid}-auth`,
            did: null,
            roles: ['user'],
            Site: { name: placeName(sid), code: '' },
            User: { name: CLOUD_NICK, stereo: '', nick: '', login: '' },
            iss: 'e2e',
            iat: Math.floor(GUEST.createdAt / 1000),
            exp: 4_102_444_800,
        }),
        'e2e-unsigned',
    ].join('.');

const siteOfToken = (token: string): string | undefined => {
    try {
        const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as { sid?: string };
        return claims.sid;
    } catch {
        return undefined;
    }
};

export const cloudTokenView = (sid: string) => ({
    id: CLOUD_USER.uid,
    createdAt: GUEST.createdAt,
    updatedAt: GUEST.createdAt,
    deletedAt: 0,
    accountId: CLOUD_USER.accountId,
    name: CLOUD_NICK,
    $role: { id: `${CLOUD_USER.uid}@${sid}`, siteId: sid, userId: CLOUD_USER.uid, name: '' },
    userRole: 'user',
    userStatus: 'active',
    Token: {
        authId: `${CLOUD_USER.uid}-auth`,
        accountId: CLOUD_USER.accountId,
        identityId: 'ap-northeast-2:00000000-0000-0000-0000-00000000c1e2',
        identityPoolId: 'ap-northeast-2:00000000-0000-0000-0000-0000000000c1',
        identityToken: cloudIdentityToken(sid),
        credential: {
            AccessKeyId: 'E2ECLOUDKEY',
            SecretKey: 'e2e-cloud-secret',
            SessionToken: 'e2e-cloud-session',
            Expiration: '2099-12-31T00:00:00.000Z',
        },
    },
    $site: { id: sid, name: placeName(sid) },
    expiresIn: 2_592_000_000,
});

const placeName = (sid: string): string =>
    sid === CLOUD_PLACE.id ? CLOUD_PLACE.name : sid === SECOND_PLACE.id ? SECOND_PLACE.name : 'default';

export const cloudInviteView = (code: string) => ({
    id: `invite-${code}`,
    state: 'pending',
    code,
    cloudId: CLOUD.id,
    cloudName: CLOUD.name,
    siteId: CLOUD_PLACE.id,
    site$: { id: CLOUD_PLACE.id, name: CLOUD_PLACE.name },
    channelId: CLOUD_ROOM.id,
    inviter$: { id: MINA.uid, name: MINA.nick },
    memberCount: 2,
    expiredAt: 4_102_444_800_000,
    $envs: { backend: CLOUD.backend, wss: CLOUD.wss },
});

export const cloudInvitePath = (code: string): string =>
    `/?code=${encodeURIComponent(code)}&provider=invite&version=2&_backend=${encodeURIComponent(CLOUD.backend)}`;

export interface CloudState {
    profileInPlace: boolean;
    sessionSite: string;
    switches: string[];
    profileReads: string[];
    profileWrites: { site: string; data: unknown }[];
    refuseSwitchInto?: string;
    refusalHeld?: Promise<void>;
}

export interface CloudOptions {
    profileInPlace: boolean;
    secondPlace?: boolean;
}

export const installCloud = (
    backend: FakeBackend,
    { profileInPlace, secondPlace = false }: CloudOptions
): CloudState => {
    const state: CloudState = {
        profileInPlace,
        sessionSite: CLOUD.defaultSite,
        switches: [],
        profileReads: [],
        profileWrites: [],
    };
    const codeOf = (url: string) => new URL(url).searchParams.get('code') ?? '';

    const http: Record<string, HttpHandler> = {
        [`GET ${CLOUD.backend}/hello/invite-code`]: request => cloudInviteView(codeOf(request.url())),
        [`POST ${CLOUD.backend}/oauth/login-invite`]: () => cloudTokenView(CLOUD.defaultSite),
    };
    backend.useHttp(http);

    const places = secondPlace ? [CLOUD_PLACE, SECOND_PLACE] : [CLOUD_PLACE];
    const rooms = secondPlace ? [CLOUD_ROOM, SECOND_PLACE_ROOM] : [CLOUD_ROOM];
    const hasProfile = (site: string) =>
        (site === CLOUD_PLACE.id && state.profileInPlace) || (secondPlace && site === SECOND_PLACE.id);
    const profileOn = (site: string) =>
        hasProfile(site)
            ? {
                  siteId: site,
                  userId: CLOUD_USER.uid,
                  nick: CLOUD_NICK,
                  active: true,
                  createdAt: GUEST.createdAt,
                  updatedAt: GUEST.createdAt,
              }
            : { siteId: site, userId: CLOUD_USER.uid, active: false, createdAt: GUEST.createdAt };

    const socket: Record<string, SocketHandler> = {
        'system.ping': () => ({ ts: Date.now() }),
        'device.save': data => ({ ...(data as object), status: 'green' }),
        'device.sync': () => undefined,
        'auth.update': data => {
            const site = siteOfToken((data as { token?: string } | null)?.token ?? '');
            if (site) state.sessionSite = site;
            return {
                cloudId: CLOUD.id,
                connId: 'e2e-cloud-conn',
                deviceId: backend.deviceId,
                authId: `${CLOUD_USER.uid}-auth`,
                memberId: CLOUD_USER.uid,
                state: 'authenticated',
                stateAt: GUEST.createdAt,
                expiresIn: 2_592_000_000,
                error: '',
                member$: { id: CLOUD_USER.uid, name: CLOUD_NICK },
            };
        },
        'auth.switch': data => {
            const target = (data as { target?: string } | null)?.target;
            if (!target?.includes('@')) throw new SocketRefusal(`400 BAD REQUEST - @target is required`);
            if (target.split('@')[1] === state.refuseSwitchInto) {
                const refusal = new SocketRefusal(`403 FORBIDDEN - cannot switch into site[${state.refuseSwitchInto}]`);
                if (!state.refusalHeld) throw refusal;
                return state.refusalHeld.then(() => Promise.reject(refusal));
            }
            state.sessionSite = target.split('@')[1];
            state.switches.push(state.sessionSite);
            return cloudTokenView(state.sessionSite);
        },
        'auth.logout': () => ({}),
        'user.profile': () => ({
            sid: state.sessionSite,
            uid: CLOUD_USER.uid,
            gid: null,
            roles: ['user'],
            identityId: '',
            $site: { id: state.sessionSite, name: placeName(state.sessionSite) },
            $user: { id: CLOUD_USER.uid, accountId: CLOUD_USER.accountId, name: CLOUD_NICK, userRole: 'user' },
        }),
        'user.my-site': () => ({
            list: places.map(place => ({ id: place.id, name: place.name, isOwner: false, createdAt: GUEST.createdAt })),
            total: places.length,
        }),
        'place.get': data => {
            const id = (data as { id?: string } | null)?.id;
            const place = places.find(candidate => candidate.id === id);
            if (!place) throw new SocketRefusal(`404 NOT FOUND - site[${id}]`);
            return { ...place, ownerId: MINA.uid, createdAt: GUEST.createdAt, updatedAt: GUEST.createdAt };
        },
        'profile.get-mine': () => {
            state.profileReads.push(state.sessionSite);
            return profileOn(state.sessionSite);
        },
        'profile.get': () => profileOn(state.sessionSite),
        'profile.set': data => {
            state.profileWrites.push({ site: state.sessionSite, data });
            if (state.sessionSite === CLOUD_PLACE.id) state.profileInPlace = true;
            return { ...profileOn(state.sessionSite), ...(data as object), siteId: state.sessionSite, active: true };
        },
        'profile.sync': () => ({ profiles: {}, syncedAt: GUEST.createdAt }),
        'channel.sync': () => ({ list: rooms, ids: rooms.map(room => room.id), syncedAt: GUEST.createdAt }),
        'channel.get': data => rooms.find(room => room.id === (data as { id?: string } | null)?.id) ?? CLOUD_ROOM,
        'channel.sync-users': () => ({
            list: [
                { id: CLOUD_USER.uid, name: CLOUD_NICK },
                { id: MINA.uid, name: MINA.nick },
            ],
            ids: [CLOUD_USER.uid, MINA.uid],
            syncedAt: GUEST.createdAt,
        }),
        'join.get': () => ({
            id: `${CLOUD_ROOM.id}@${CLOUD_USER.uid}`,
            channelId: CLOUD_ROOM.id,
            userId: CLOUD_USER.uid,
            joined: 1,
            chatNo: 0,
        }),
        'chat.feed': () => ({ list: [], cursorNo: 0, readNo: 0, total: 0 }),
    };
    backend.useSocketAt(CLOUD.wss, socket);
    return state;
};

export const ownedCloudRow = () => ({
    id: CLOUD.id,
    name: CLOUD.name,
    email: 'owner@e2e.test',
    status: 'active',
    state$: { plan: 'keep' },
    owner$: { id: GUEST.uid, name: GUEST.uid },
    createdAt: GUEST.createdAt,
    updatedAt: GUEST.createdAt,
});

export interface OwnedCloudState {
    delegations: number;
    issue: boolean;
}

export const ownCloud = (backend: FakeBackend, { issue = true }: { issue?: boolean } = {}): OwnedCloudState => {
    const owned: OwnedCloudState = { delegations: 0, issue };
    signedInMember(backend);
    backend.useHttp({
        'GET /clouds/0/list': () => ({
            sort: '',
            limit: 2000,
            page: 0,
            list: [ownedCloudRow()],
            total: 1,
            aggr: { status: { active: 1 } },
        }),
        'POST /users/0/delegate-cloud': () => {
            owned.delegations += 1;
            if (!owned.issue) throw new Error('503 SERVICE UNAVAILABLE - cloud is not reachable');
            return {
                delegationToken: 'e2e-delegation-token',
                cloudId: CLOUD.id,
                expiredAt: 4_102_444_800_000,
                backend: CLOUD.backend,
                wss: CLOUD.wss,
            };
        },
        [`POST ${CLOUD.backend}/oauth/exchange-token`]: () => cloudTokenView(CLOUD.defaultSite),
    });
    return owned;
};
