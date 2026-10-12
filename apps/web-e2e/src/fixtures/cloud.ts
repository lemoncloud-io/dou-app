import { SocketRefusal, type FakeBackend, type HttpHandler, type SocketHandler } from './backend';
import { GUEST } from './guest';
import { MINA } from './rooms';

/**
 * A cloud the guest is invited into: its backend and socket, and the one place and room the invites
 * lead to. Every value is invented. The rule the fake socket keeps is the server's own: **a session
 * sits on one place at a time** — the place its token names when it signs in (`auth.update`), and
 * whichever place it last switched to (`auth.switch`) — and a place profile is read and written on
 * that place, whatever the request names.
 */

export const CLOUD = {
    id: '1000099',
    name: 'E2E Cloud',
    backend: 'https://c1.e2e.test/api',
    wss: 'wss://c1-ws.e2e.test/cht',
    /** The place every cloud has, and the one an invite login's token is signed for. */
    defaultSite: '0000',
} as const;

/** The place the invites lead into. */
export const CLOUD_PLACE = { id: '10001', name: 'Design Team' } as const;

/** The guest's name in that place. */
export const CLOUD_NICK = 'Kim in Design';

/** The room both invites name. */
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

/**
 * A second place in the same cloud, opt-in (`secondPlace`), for switching between places. The guest
 * has a profile there, so entering it asks for nothing.
 */
export const SECOND_PLACE = { id: '10002', name: 'Marketing' } as const;

/** The one room in the second place. */
export const SECOND_PLACE_ROOM = {
    ...CLOUD_ROOM,
    id: 'e2e-cloud-room-2',
    name: 'Campaign Sync',
    sid: SECOND_PLACE.id,
    $: { sid: SECOND_PLACE.id },
};

/** The guest's user inside the cloud, which the invite login creates. */
export const CLOUD_USER = { uid: '2000001', accountId: 'C.e2e.invitee' } as const;

const base64Url = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

/** The invitee's identity token in the cloud, signed for `sid`. Unsigned: nothing here verifies it. */
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

/** The place a token names — read back out of the token the page signs in with. */
const siteOfToken = (token: string): string | undefined => {
    try {
        const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as { sid?: string };
        return claims.sid;
    } catch {
        return undefined;
    }
};

/** A cloud token view for the invitee on `sid` — the invite login's answer, and `auth.switch`'s. */
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

/**
 * A cloud room invite as the cloud's backend answers `hello/invite-code`: who sent it, which cloud,
 * place and room it leads into, and where that cloud lives.
 */
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

/**
 * The path the app hands the web for a cloud invite link (`/s?code=…&backend=…`), after its
 * converter: the home route with the invite markers and the cloud's backend.
 */
export const cloudInvitePath = (code: string): string =>
    `/?code=${encodeURIComponent(code)}&provider=invite&version=2&_backend=${encodeURIComponent(CLOUD.backend)}`;

/** What the fake cloud knows about the session, for a scenario to assert on. */
export interface CloudState {
    /** Whether the guest has a place profile in `CLOUD_PLACE`. A save there creates it. */
    profileInPlace: boolean;
    /** The place the session sits on now. */
    sessionSite: string;
    /** Every place the session switched to, in order. */
    switches: string[];
    /** The place each profile read was answered on, in order. */
    profileReads: string[];
    /** Every place profile write, with the place it landed on. */
    profileWrites: { site: string; data: unknown }[];
    /** A place `auth.switch` refuses to move the session into, as the cloud refuses a place it cannot open. */
    refuseSwitchInto?: string;
    /** Holds that refusal until it settles, so a scenario can see what the page does while it waits. */
    refusalHeld?: Promise<void>;
}

export interface CloudOptions {
    /** Whether the guest already has a place profile in `CLOUD_PLACE`. */
    profileInPlace: boolean;
    /** Adds `SECOND_PLACE` and its room beside `CLOUD_PLACE`. */
    secondPlace?: boolean;
}

/**
 * The cloud's backend and socket. Answers for any invite code. A place profile can exist only on
 * `CLOUD_PLACE` (`profileInPlace`); reading one anywhere else finds the empty, inactive row the
 * server's get-or-create hands back.
 */
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
        // An invite login answers with the invitee's own token, signed for the cloud's default place.
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
            // The socket signs in on the place its token names (`{ token }`, as the socket SDK sends it).
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
            // `target` is `<uid>@<sid>`, as the socket SDK's `auth.switch` sends it.
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
        // Leaving the session the page is about to re-enter with another token.
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
        // Cloud-wide: every place's rooms in one answer, which the page sorts into places by `sid`.
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

/** The cloud as the relay's catalog lists it for its owner: live, with an email bound. */
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

/** What the relay and the cloud saw of entering the cloud as its owner. */
export interface OwnedCloudState {
    /** `delegate-cloud` requests the relay had, refused or not. */
    delegations: number;
    /** Whether the relay issues the delegation; a refusal is the cloud failing to be entered at all. */
    issue: boolean;
}

/**
 * The guest owns the cloud: the relay's catalog lists it, and entering it goes the owner's way — a
 * delegation from the relay (`delegate-cloud`), traded on the cloud's backend for the owner's own
 * token there (`exchange-token`), signed for the cloud's default place like an invite login's.
 * `issue: false` refuses the delegation, which no retry gets past.
 */
export const ownCloud = (backend: FakeBackend, { issue = true }: { issue?: boolean } = {}): OwnedCloudState => {
    const owned: OwnedCloudState = { delegations: 0, issue };
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
