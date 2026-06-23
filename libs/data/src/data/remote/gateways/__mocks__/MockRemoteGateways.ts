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
        place: {
            create: jest.fn(),
            get: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            mySite: jest.fn(),
        },
        user: {
            listUser: jest.fn(),
            update: jest.fn(),
            invite: jest.fn(),
            inviteBatch: jest.fn(),
            syncUsers: jest.fn(),
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
            get: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        profile: {
            get: jest.fn(),
            getMine: jest.fn(),
            set: jest.fn(),
            sync: jest.fn(),
        },
    }) as unknown as MockRemoteGatewayBundle;
