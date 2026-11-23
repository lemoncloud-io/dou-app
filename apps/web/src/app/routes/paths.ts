export const ROUTES = {
    root: '/',

    auth: {
        login: '/auth/login',
        logout: '/auth/logout',
    },
    account: {
        signup: {
            root: '/account/signup',
            verify: '/account/signup/verify',
            password: '/account/signup/password',
        },
        resetPassword: {
            root: '/account/reset-password',
            verify: '/account/reset-password/verify',
            newPassword: '/account/reset-password/new-password',
        },
    },

    home: '/',

    notifications: '/notifications',

    miniApps: {
        root: '/miniapps',
        manage: '/miniapps/manage',
    },

    channels: {
        root: '/channels',
        room: (channelId: string) => `/channels/${channelId}/room`,
        thread: (channelId: string, rootNo: string | number) => `/channels/${channelId}/thread/${rootNo}`,
        settings: (channelId: string) => `/channels/${channelId}/settings`,
        invite: (channelId: string) => `/channels/${channelId}/invite`,
        inviteLink: (channelId: string) => `/channels/${channelId}/invite/link`,
        audio: (channelId: string, chatNo: number, idx: number) => `/channels/${channelId}/audio/${chatNo}/${idx}`,
        files: (channelId: string, tab?: string) => `/channels/${channelId}/files${tab ? `?tab=${tab}` : ''}`,
        startDm: '/channels/start-dm',
    },

    invite: {
        accept: '/invite/accept',
        contact: '/invite/contact',
        waiting: (inviteId: string) => `/invite/${inviteId}/waiting`,
        place: (placeId: string) => `/invite/place/${placeId}`,
        placeLink: (placeId: string) => `/invite/place/${placeId}/link`,
    },

    place: {
        detail: (placeId: string) => `/place/${placeId}`,
        settings: (placeId: string) => `/place/${placeId}/settings`,
        settingsDetail: (placeId: string) => `/place/${placeId}/settings/detail`,
        settingsEdit: (placeId: string) => `/place/${placeId}/settings/edit`,
        settingsProfile: (placeId: string) => `/place/${placeId}/settings/profile`,
        settingsChannels: (placeId: string) => `/place/${placeId}/settings/channels`,
        settingsMembers: (placeId: string) => `/place/${placeId}/settings/members`,
    },

    share: (id: string) => `/share?id=${encodeURIComponent(id)}`,

    search: {
        root: '/search',
    },

    subscription: {
        root: '/subscription',
        guide: '/subscription/guide',
        plans: '/subscription/plans',
        detail: '/subscription/detail',
        confirm: '/subscription/confirm',
        keep: '/subscription/keep',
    },

    onboarding: {
        setup: '/onboarding/setup',
    },

    mypage: {
        root: '/mypage',
        login: '/mypage/login',
        loginEmail: '/mypage/login/email',
        pairing: {
            code: '/mypage/login/pair',
            approve: '/mypage/pairing/approve',
            devices: '/mypage/devices',
        },
        account: {
            info: '/mypage/account',
            edit: '/mypage/edit',
        },
        cloud: {
            manage: '/mypage/cloud-manage',
            hub: (cloudId: string) => `/mypage/cloud-manage/${cloudId}`,
            edit: (cloudId: string) => `/mypage/cloud-manage/${cloudId}/edit`,
            detail: (cloudId: string) => `/mypage/cloud-manage/${cloudId}/detail`,
            places: (cloudId: string) => `/mypage/cloud-manage/${cloudId}/places`,
        },
        settings: {
            root: '/mypage/settings',
            notifications: '/mypage/settings/notifications',
            lab: '/mypage/settings/lab',
        },
        policy: {
            root: '/mypage/policy',
            terms: '/mypage/policy/terms',
            licenses: '/mypage/policy/licenses',
            privacy: '/mypage/policy/privacy',
        },
        feedback: '/mypage/feedback',
    },
} as const;

export const ROUTE_PARAMS = {
    channelId: 'channelId',
    placeId: 'placeId',
} as const;
