/**
 * The one person every scenario signs in as: a guest on the relay, in its default place (`0000`),
 * which is what a first launch of the app is. Every value is invented; nothing here was issued by a
 * server.
 */
export const GUEST = {
    uid: '900001',
    sid: '0000',
    accountId: 'D.e2e.guest',
    authId: 'e2e-auth-0001',
    code: 'E2EGUEST',
    /** Fixed so every row keyed by time sorts the same on every run. */
    createdAt: 1_790_000_000_000,
} as const;

/** The relay's default place, as the server embeds it in the login and profile answers. */
export const RELAY_SITE = {
    id: GUEST.sid,
    createdAt: GUEST.createdAt,
    updatedAt: GUEST.createdAt,
    deletedAt: 0,
    name: 'default',
    stereo: 'domain',
    domain: 'localhost',
} as const;

const base64Url = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * An identity token with the claims the web reads, and a signature nobody checks. The web never
 * verifies it — the server is the only party that does, and in these scenarios the server is the
 * fixture — so a placeholder signature is enough, and it makes plain that the token is not real.
 */
export const guestIdentityToken = (deviceId: string): string =>
    [
        base64Url({ alg: 'none', typ: 'JWT' }),
        base64Url({
            cid: '#',
            sid: GUEST.sid,
            gid: null,
            uid: GUEST.uid,
            aid: GUEST.authId,
            did: null,
            roles: ['guest'],
            Site: { name: 'default', code: '' },
            User: { name: deviceId, stereo: '', nick: '', login: '' },
            iss: 'e2e',
            iat: Math.floor(GUEST.createdAt / 1000),
            // Far ahead, so no run is ever old enough for the web to try a refresh.
            exp: 4_102_444_800,
        }),
        'e2e-unsigned',
    ].join('.');

/** `POST /oauth/register-device` — a fresh guest, as the relay answers a device it has not seen. */
export const registerDeviceAnswer = (deviceId: string) => ({
    id: GUEST.uid,
    createdAt: GUEST.createdAt,
    updatedAt: GUEST.createdAt,
    deletedAt: 0,
    accountId: GUEST.accountId,
    name: deviceId,
    code: GUEST.code,
    account$: { id: GUEST.accountId, stereo: 'device', name: deviceId },
    $role: {
        id: `${GUEST.uid}@${GUEST.sid}`,
        createdAt: GUEST.createdAt,
        updatedAt: GUEST.createdAt,
        deletedAt: 0,
        siteId: GUEST.sid,
        userId: GUEST.uid,
        name: '',
    },
    userRole: 'guest',
    userStatus: 'active',
    Token: {
        authId: GUEST.authId,
        accountId: GUEST.accountId,
        identityId: 'ap-northeast-2:00000000-0000-0000-0000-000000000e2e',
        identityPoolId: 'ap-northeast-2:00000000-0000-0000-0000-0000000000e2',
        identityToken: guestIdentityToken(deviceId),
        credential: {
            AccessKeyId: 'E2EACCESSKEY',
            SecretKey: 'e2e-secret',
            SessionToken: 'e2e-session',
            Expiration: '2099-12-31T00:00:00.000Z',
        },
    },
    $site: RELAY_SITE,
    $auth: {
        id: GUEST.authId,
        createdAt: GUEST.createdAt,
        updatedAt: GUEST.createdAt,
        deletedAt: 0,
        stereo: '',
        accountId: GUEST.accountId,
        userId: GUEST.uid,
        siteId: GUEST.sid,
    },
    expiresIn: 2_592_000_000,
});

/** `user.profile` on the socket — the guest's place profile in the relay place. */
export const guestProfile = (deviceId: string) => ({
    sid: GUEST.sid,
    uid: GUEST.uid,
    gid: null,
    roles: ['guest'],
    identityId: '',
    $site: RELAY_SITE,
    $user: {
        id: GUEST.uid,
        createdAt: GUEST.createdAt,
        updatedAt: GUEST.createdAt,
        deletedAt: 0,
        accountId: GUEST.accountId,
        name: deviceId,
        code: GUEST.code,
        account$: { id: GUEST.accountId, stereo: 'device', name: deviceId },
        userRole: 'guest',
        userStatus: 'active',
    },
    $membership: {
        id: `MS${GUEST.uid}`,
        createdAt: GUEST.createdAt,
        updatedAt: GUEST.createdAt,
        deletedAt: 0,
        status: 'none',
        userId: GUEST.uid,
    },
});

/** The guest's display profile in the relay place — the name the room header and home row show. */
export const GUEST_NICK = 'E2E Guest';

export const guestRelayProfile = {
    siteId: GUEST.sid,
    userId: GUEST.uid,
    nick: GUEST_NICK,
    createdAt: GUEST.createdAt,
    updatedAt: GUEST.createdAt,
};

/** A new guest's one room: the self chat, which on the relay lives in its default place. */
export const SELF_CHANNEL = {
    id: 'e2e-self',
    name: '',
    stereo: 'self',
    sid: GUEST.sid,
    $: { sid: GUEST.sid },
    ownerId: GUEST.uid,
    memberNo: 1,
    chatNo: 0,
    createdAt: GUEST.createdAt,
    updatedAt: GUEST.createdAt,
};

/** The guest's membership of that room, read up to nothing. */
export const selfJoin = {
    id: `${SELF_CHANNEL.id}@${GUEST.uid}`,
    channelId: SELF_CHANNEL.id,
    userId: GUEST.uid,
    joined: 1,
    chatNo: 0,
};
