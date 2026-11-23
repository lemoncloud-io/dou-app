import type { SocketGatewayBundle } from '..';

type MockedGateway<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? jest.MockedFunction<T[K]> : MockedGateway<T[K]>;
};

export type MockSocketGatewayBundle = {
    [K in keyof SocketGatewayBundle]: MockedGateway<SocketGatewayBundle[K]>;
};

export const createMockSocketGateways = (): MockSocketGatewayBundle => ({
    auth: {
        linkAccount: jest.fn(),
    },
    channel: {
        create: jest.fn(),
        get: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        leave: jest.fn(),
        getSelf: jest.fn(),
        mine: jest.fn(),
        invite: jest.fn(),
        sync: jest.fn(),
        startDm: jest.fn(),
    },
    chat: {
        send: jest.fn(),
        get: jest.fn(),
        feed: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        reaction: jest.fn(),
    },
    join: {
        update: jest.fn(),
        read: jest.fn(),
    },
    place: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        leave: jest.fn(),
        get: jest.fn(),
        mySite: jest.fn(),
    },
    user: {
        listUser: jest.fn(),
        listPlaceUser: jest.fn(),
        update: jest.fn(),
        profile: jest.fn(),
        invite: jest.fn(),
        inviteBatch: jest.fn(),
        listDevice: jest.fn(),
        unlinkDevice: jest.fn(),
        syncUsers: jest.fn(),
    },
    invite: {
        create: jest.fn(),
        get: jest.fn(),
        list: jest.fn(),
        accept: jest.fn(),
        cancel: jest.fn(),
        reject: jest.fn(),
    },
    device: {
        active: { save: jest.fn(), read: jest.fn(), sync: jest.fn(), updateRemote: jest.fn() },
        relay: { save: jest.fn(), read: jest.fn(), sync: jest.fn(), updateRemote: jest.fn() },
    },
    connection: {
        request: jest.fn(),
    },
    cloud: {
        get: jest.fn(),
        update: jest.fn(),
    },
    profile: {
        get: jest.fn(),
        getMine: jest.fn(),
        set: jest.fn(),
        sync: jest.fn(),
    },
    upload: {
        start: jest.fn(),
        complete: jest.fn(),
    },
    webhook: {
        get: jest.fn(),
        list: jest.fn(),
        makeToken: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
});
