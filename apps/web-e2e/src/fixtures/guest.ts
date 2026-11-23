export const GUEST = {
    uid: '900001',
    sid: '0000',
    accountId: 'D.e2e.guest',
    authId: 'e2e-auth-0001',
    code: 'E2EGUEST',
    createdAt: 1_790_000_000_000,
} as const;

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
            exp: 4_102_444_800,
        }),
        'e2e-unsigned',
    ].join('.');

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

export const GUEST_NICK = 'E2E Guest';

export const guestRelayProfile = {
    siteId: GUEST.sid,
    userId: GUEST.uid,
    nick: GUEST_NICK,
    createdAt: GUEST.createdAt,
    updatedAt: GUEST.createdAt,
};

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

export const selfJoin = {
    id: `${SELF_CHANNEL.id}@${GUEST.uid}`,
    channelId: SELF_CHANNEL.id,
    userId: GUEST.uid,
    joined: 1,
    chatNo: 0,
};
