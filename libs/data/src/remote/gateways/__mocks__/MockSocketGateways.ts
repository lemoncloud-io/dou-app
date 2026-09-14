import type { SocketGatewayBundle } from '..';

/**
 * Recurses into nested gateway objects so a `RoutedGateway<G>` (`device`) mocks all three of its
 * slots. Stopping at the first level left `device.active.save` typed as the raw function, and a test
 * calling `.mockResolvedValue()` on it had no type at all to check against.
 */
type MockedGateway<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? jest.MockedFunction<T[K]> : MockedGateway<T[K]>;
};

export type MockSocketGatewayBundle = {
    [K in keyof SocketGatewayBundle]: MockedGateway<SocketGatewayBundle[K]>;
};

/**
 * The bundle every socket data source test builds on.
 *
 * **This literal is deliberately NOT cast.** The return type is checked against
 * `SocketGatewayBundle`, so an action added to a domain `Pick<>` fails to compile here until it gets
 * a `jest.fn()`, and an action removed from a `Pick<>` fails as an excess property. The cast this
 * file used to end with (`as unknown as MockSocketGatewayBundle`) turned both into silence: `chat`
 * lost `reaction` for as long as it was picked, and `channel` accumulated five keys its `Pick<>` had
 * stopped offering. What surfaced instead was `gateway.<action> is not a function` at test runtime.
 *
 * If a new entry will not typecheck, fix the gateway type — do not reach for a cast.
 */
export const createMockSocketGateways = (): MockSocketGatewayBundle => ({
    auth: {
        linkAccount: jest.fn(),
    },
    channel: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        leave: jest.fn(),
        getSelf: jest.fn(),
        mine: jest.fn(),
        invite: jest.fn(),
        unreads: jest.fn(),
        sync: jest.fn(),
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
        get: jest.fn(),
        update: jest.fn(),
        read: jest.fn(),
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
        profile: jest.fn(),
        invite: jest.fn(),
        inviteBatch: jest.fn(),
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
        // Routed gateway: one gateway instance per SocketRoute (active/relay/cloud).
        active: { save: jest.fn(), read: jest.fn(), sync: jest.fn(), updateRemote: jest.fn() },
        relay: { save: jest.fn(), read: jest.fn(), sync: jest.fn(), updateRemote: jest.fn() },
        cloud: { save: jest.fn(), read: jest.fn(), sync: jest.fn(), updateRemote: jest.fn() },
    },
    connection: {
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
});
