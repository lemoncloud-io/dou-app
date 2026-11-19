import type { ChaticAppsData } from './runtime';
import { LISTENER } from './runtime';
import type { MockData } from './mock';
import type { CloudChannel, CloudChat, CloudList, CloudSession } from './runtimeTypes';

/**
 * The typed surface, checked by the compiler. The lib's typecheck (`tsc -b`, which covers this file)
 * fails on a type error here, and on each `@ts-expect-error` whose line stops being one; ts-jest only
 * transpiles it. Nothing here runs against an app — the functions are compiled, never called.
 */

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(): T => true as T;

export const typedCalls = async (runtime: ChaticAppsData) => {
    const rooms = await runtime.call('channel.cacheReadList', { sid: 's1' });
    expectType<Equal<typeof rooms, CloudList<CloudChannel> | null>>();

    const room = await runtime.call('channel.cacheRead', 'ch1');
    expectType<Equal<typeof room, CloudChannel | null>>();

    const sent = await runtime.sendMessage('ch1', 'hi');
    expectType<Equal<typeof sent, CloudChat>>();

    const session = runtime.session();
    expectType<Equal<typeof session, CloudSession | null>>();

    // @ts-expect-error -- a known method with arguments of the wrong shape
    await runtime.call('channel.cacheRead', 42);
    // @ts-expect-error -- a known method missing its argument
    await runtime.call('chat.cacheReadList');
    // @ts-expect-error -- the send takes a room and text, and nothing else a message can carry
    await runtime.call('chat.sendChat', { channelId: 'ch1', content: 'hi', uploadIds: ['u1'] });
    // @ts-expect-error -- the cloud read only with `cache: false`
    await runtime.call('cloud.getCloud', { id: 'c1' }, { cache: true });
    // @ts-expect-error -- a stream is not a call
    await runtime.call('channel.observeList', {});

    // A name this library does not know answers `unknown`, so a typo cannot be read as a row.
    const misspelled = await runtime.call('channel.cacheReadLst', {});
    expectType<Equal<typeof misspelled, unknown>>();
    // The untyped spelling, with an explicit type, still compiles against a known name.
    const untyped = await runtime.call<{ list: unknown[] }>('channel.cacheReadList', {});
    expectType<Equal<typeof untyped, { list: unknown[] }>>();
};

export const typedStreams = async (runtime: ChaticAppsData) => {
    await runtime.subscribe('channel.observeList', [{ sid: 's1' }], result => {
        expectType<Equal<typeof result, CloudList<CloudChannel> | null>>();
    });
    await runtime.subscribe('chat.observeFeedCoverage', ['ch1'], covered => {
        expectType<Equal<typeof covered, (readonly [low: number, high: number])[]>>();
    });
    // The untyped spelling, with the marker, still compiles.
    await runtime.subscribe('channel.observeItem', ['ch1', LISTENER], () => undefined);

    // @ts-expect-error -- wrong argument for a known stream
    await runtime.subscribe('channel.observeItem', [1], () => undefined);
    // @ts-expect-error -- nothing after the listener: the app would read it as its own options
    await runtime.subscribe('channel.observeList', [{}, LISTENER, { cid: 'c2' }], () => undefined);
    // @ts-expect-error -- the listener hears the stream's own event
    await runtime.subscribe('channel.observeItem', ['ch1'], (item: string) => item);
};

export const typedMock: MockData = {
    calls: {
        'channel.cacheRead': id => ({ id, cid: 'c1', sid: 's1', isNotificationEnabled: true }),
        // @ts-expect-error -- an answer of the wrong shape fails here, not in the app
        'channel.cacheReadList': () => ({ list: [] }),
        // A method this library does not know answers anything.
        'channel.fromANewerApp': () => 'anything',
    },
    streams: {
        'place.observeItem': (emit, id) => {
            emit(null);
            // @ts-expect-error -- the event of the wrong shape
            emit({ id });
        },
    },
};

describe('the typed runtime surface', () => {
    it('compiles as the declarations say', () => {
        expect([typedCalls, typedStreams, typedMock].every(Boolean)).toBe(true);
    });
});
