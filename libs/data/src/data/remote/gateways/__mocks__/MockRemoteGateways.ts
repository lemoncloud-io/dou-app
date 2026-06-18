import type { RemoteGatewayBundle } from '..';

type MockedGateway<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? jest.MockedFunction<T[K]> : T[K];
};

export type MockRemoteGatewayBundle = {
    [K in keyof RemoteGatewayBundle]: MockedGateway<RemoteGatewayBundle[K]>;
};

export const createMockRemoteGateways = (): MockRemoteGatewayBundle =>
    ({
        auth: {
            update: jest.fn(),
        },
        channel: {
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            join: jest.fn(),
            leave: jest.fn(),
            getSelf: jest.fn(),
            mine: jest.fn(),
            listUser: jest.fn(),
            invite: jest.fn(),
            updateJoin: jest.fn(),
            unreads: jest.fn(),
            sync: jest.fn(),
            syncUsers: jest.fn(),
            syncProfile: jest.fn(),
        },
        chat: {
            send: jest.fn(),
            get: jest.fn(),
            read: jest.fn(),
            feed: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        join: {
            read: jest.fn(),
            updateJoin: jest.fn(),
            join: jest.fn(),
        },
        site: {
            mySite: jest.fn(),
            makeSite: jest.fn(),
            updateSite: jest.fn(),
        },
        user: {
            listUser: jest.fn(),
            updateProfile: jest.fn(),
            invite: jest.fn(),
            inviteBatch: jest.fn(),
            syncUsers: jest.fn(),
            syncProfile: jest.fn(),
        },
        device: {
            save: jest.fn(),
            read: jest.fn(),
            sync: jest.fn(),
        },
        sockets: {
            request: jest.fn(),
        },
        cloud: {
            update: jest.fn(),
        },
        profile: {
            getSiteProfile: jest.fn(),
            setSiteProfile: jest.fn(),
        },
    }) as MockRemoteGatewayBundle;
