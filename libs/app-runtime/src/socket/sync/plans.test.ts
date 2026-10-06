// plans.ts → data/runtime.ts → DataManager.ts → httpFactory.ts imports `@chatic/http`'s transport as
// a value (webTransport). That chain used to lead to `@chatic/web-config` (an import.meta holder that
// ts-jest's CJS parser can't handle), but now leads to `@chatic/config` (import.meta count 0), so
// parsing is no longer the problem — this mock is kept anyway, to cut and isolate the session
// dependency this test doesn't actually use.
import { logger } from '@chatic/bridges';

import { slotKeyOf } from '../utils/slotKey';
import { createSyncPlans } from './plans';
import { clearRefusedChannels, isChannelRefused } from './refusedChannels';

jest.mock('../../session', () => new Proxy({}, { get: () => jest.fn() }));
// Only the data-runtime accessors are cut — `toDomainChat` has to be the real thing, because that's
// the only way to see whether `hidden` survives the mapping. The socket runtime needs no mock: the
// slot's cloud comes in as `createSyncPlans`'s argument. `jest.mock` only hoists from the top of the
// file, so this lives here rather than inside a describe. The snapshot contract test above never
// calls these accessors, so it's unaffected.
//
// Registration happens **once** per module. Registering the same module twice lets the later one win
// silently, so any value that a suite needs to swap answers for lives in a holder the factory reads —
// that's how this one file holds two suites together.
const mockCacheWrite = jest.fn();
/** What the data manager answers `getScopedContext(cid)` with; a test that needs another uid swaps it. */
const mockScopedContext: { current: (cid: string) => { cid: string; uid?: string; socketCid?: string } } = {
    current: cid => ({ cid, uid: 'user-1', socketCid: cid }),
};
/** `null` means the chat-change suite's default repositories are used. */
const mockRepositories: { current: Record<string, unknown> | null } = { current: null };
/** Every cloud a plan asked for a scoped graph of, in order. */
const mockGraphRequests: string[] = [];
jest.mock('../../data/runtime', () => ({
    getDataManager: () => ({
        getScopedContext: (cid: string) => mockScopedContext.current(cid),
        getScopedRepositories: (cid: string) => {
            mockGraphRequests.push(cid);
            return mockRepositories.current ?? { chat: { cacheWrite: mockCacheWrite, cacheWriteMany: jest.fn() } };
        },
    }),
}));
const CLOUD_1 = slotKeyOf('cloud-1');
// createSyncPlans reads its runtime dependencies lazily inside callbacks (see the file-top comment),
// so just creating plans and calling the onConnected hook needs no socket/data runtime at all — the
// reason this contract test can exist.
describe('createSyncPlans — 재연결 스냅샷 유지 (ADR-0059)', () => {
    it.each(['channel', 'place', 'profile', 'join'] as const)(
        '%s plan은 onConnected에서 스냅샷을 리셋하지 않는다',
        domain => {
            const plan = createSyncPlans(CLOUD_1).find(candidate => candidate.domain === domain);
            expect(plan).toBeDefined();

            const writeSnapshot = jest.fn();
            // The default resetting implementation would call writeSnapshot(target, undefined) here —
            // that call must not happen, or every reconnect (foreground return) produces an
            // identical-data write for every target.
            plan?.onConnected?.({ type: domain, id: 't-1' }, { writeSnapshot } as never);

            expect(writeSnapshot).not.toHaveBeenCalled();
        }
    );
});

/**
 * The path through which an edit or delete made by someone else lands. If the `onUpdate` that
 * sockets-lib 0.5.1 opened up isn't wired, the change reaches nowhere and only converges on the next
 * `chat.feed` refetch — a silent failure, which is why it's pinned down with a test.
 *
 * Only the runtime accessors are mocked; `toDomainChat` is the real one, because the one thing this
 * wants to confirm is whether `hidden` survives the mapping all the way to the cache row.
 */
describe('createSyncPlans — chat 변경 반영 (sockets-lib 0.5.1 onUpdate)', () => {
    /**
     * `onUpdate` is a constructor option, not a public hook of the plan — the plan calls it internally
     * (when a payload arrives again for an already-resolved chatNo). So instead of invoking it, this
     * pulls out **the callback we passed** and checks that directly. That's the real seam, and a
     * missing wire-up (the option not being there at all) gets caught here too.
     */
    const chatOnUpdate = () => {
        const plan = createSyncPlans(CLOUD_1).find(candidate => candidate.domain === 'chat') as unknown as {
            options?: { onUpdate?: (target: unknown, changed: unknown, snapshot: unknown) => void };
        };
        return plan?.options?.onUpdate;
    };

    beforeEach(() => {
        mockCacheWrite.mockClear();
        mockGraphRequests.length = 0;
        mockScopedContext.current = cid => ({ cid, uid: 'user-1', socketCid: cid });
        mockRepositories.current = null;
    });

    it('배선돼 있다 — 없으면 변경이 다음 chat.feed까지 반영되지 않는다', () => {
        expect(chatOnUpdate()).toBeDefined();
    });

    it('편집은 바뀐 메시지를 그대로 캐시에 쓴다', () => {
        chatOnUpdate()?.(
            { type: 'chat', id: 'ch-1' },
            { id: 'ch-1:7', channelId: 'ch-1', chatNo: 7, content: '고친 내용' },
            {}
        );

        expect(mockCacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'ch-1:7', content: '고친 내용', cid: 'cloud-1' })
        );
    });

    it('삭제는 행을 지우지 않고 hidden으로 쓴다 — deleteChat과 같은 상태로 수렴한다', () => {
        chatOnUpdate()?.(
            { type: 'chat', id: 'ch-1' },
            { id: 'ch-1:7', channelId: 'ch-1', chatNo: 7, hidden: true },
            {}
        );

        // Deleting the row would let it come back on the next sync, making a screen show the same message as gone → tombstone twice.
        expect(mockCacheWrite).toHaveBeenCalledWith(expect.objectContaining({ id: 'ch-1:7', hidden: true }));
    });

    it("writes through the graph of the slot's own cloud", () => {
        chatOnUpdate()?.({ type: 'chat', id: 'ch-1' }, { id: 'ch-1:7', channelId: 'ch-1', chatNo: 7 }, {});

        expect(mockGraphRequests).toEqual(['cloud-1']);
        expect(mockCacheWrite).toHaveBeenCalledWith(expect.objectContaining({ cid: 'cloud-1' }));
    });
});

describe('join plan onRemove — 퇴장한 방의 메시지 캐시 정리 (ADR-0067)', () => {
    // onRemove only goes in as a plan constructor option and the lib never exposes it publicly. What
    // this wants to verify is not the lib's dispatch but the judgment of the callback we passed, so it
    // pulls that callback out and calls it directly.
    const onRemoveOf = (uid: string | undefined) => {
        const cacheDelete = jest.fn();
        const cacheClearByChannelId = jest.fn();
        mockRepositories.current = { join: { cacheDelete }, chat: { cacheClearByChannelId } };
        mockScopedContext.current = cid => ({ cid, uid, socketCid: cid });

        const plan = createSyncPlans(slotKeyOf('cloud-a')).find(candidate => candidate.domain === 'join');
        const onRemove = (plan as unknown as { options: { onRemove: (target: { id: string }) => void } }).options
            .onRemove;
        return { onRemove, cacheDelete, cacheClearByChannelId };
    };

    it('내 join이 사라지면 그 채널의 chat 캐시를 비운다', () => {
        const { onRemove, cacheDelete, cacheClearByChannelId } = onRemoveOf('me');

        onRemove({ id: 'ch-1@me' });

        expect(cacheDelete).toHaveBeenCalledWith('ch-1@me');
        expect(cacheClearByChannelId).toHaveBeenCalledWith('ch-1');
    });

    it('다른 멤버의 join이 사라지면 내 chat 캐시는 건드리지 않는다', () => {
        const { onRemove, cacheDelete, cacheClearByChannelId } = onRemoveOf('me');

        onRemove({ id: 'ch-1@someone-else' });

        expect(cacheDelete).toHaveBeenCalledWith('ch-1@someone-else');
        expect(cacheClearByChannelId).not.toHaveBeenCalled();
    });

    // "Mine" is judged by the uid this account has in the slot's cloud, which is the uid of the
    // partition being cleared.
    it("judges the join as mine by this account's uid in the slot's cloud", () => {
        const { onRemove, cacheClearByChannelId } = onRemoveOf('uid-in-a');

        onRemove({ id: 'ch-1@uid-in-a' });

        expect(cacheClearByChannelId).toHaveBeenCalledWith('ch-1');
    });

    it('합성 id가 아니면 아무것도 비우지 않는다', () => {
        const { onRemove, cacheClearByChannelId } = onRemoveOf('me');

        onRemove({ id: 'not-a-composite-id' });

        expect(cacheClearByChannelId).not.toHaveBeenCalled();
    });
});

/**
 * When the scheduler permanently stops a target, the lib's plan calls our `onRemove` from
 * `onStopped` — in other words, **a stop is a delete**. That delete already had its own trigger (the
 * suite above), but the reason that called the delete had none.
 *
 * Spies on the real `@chatic/bridges` rather than mocking the module. A partial mock
 * (`{ logger: { error } }`) broke three other suites in this track — anything that indirectly
 * consumes the same module loses its other exports. A spy has no such risk.
 */
describe('plan onStopped — 정지를 삭제 전에 남긴다', () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation();

    beforeEach(() => {
        errorSpy.mockClear();
        mockRepositories.current = {
            channel: { cacheDelete: jest.fn() },
            place: { cacheDelete: jest.fn() },
            profile: { cacheDelete: jest.fn() },
            join: { cacheDelete: jest.fn() },
            chat: { cacheClearByChannelId: jest.fn() },
        };
        mockScopedContext.current = cid => ({ cid, uid: 'me', socketCid: cid });
    });

    afterAll(() => errorSpy.mockRestore());

    const planOf = (domain: string) => createSyncPlans(CLOUD_1).find(candidate => candidate.domain === domain);

    /** The lib's onStopped reads the snapshot and passes it to onRemove — this is the bare minimum needed. */
    const CTX = { readSnapshot: () => undefined } as never;

    const FAILURE = {
        target: { type: 'join' },
        error: new Error('404 NOT FOUND'),
        kind: 'gone' as const,
        failures: 2,
        goneStreak: 2,
    };

    it.each(['channel', 'place', 'profile', 'chat', 'join'])('%s plan이 정지를 error로 남긴다', domain => {
        planOf(domain)?.onStopped?.({ type: domain, id: 't-1' } as never, FAILURE as never, CTX);

        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0][0]).toBe('SYNC');
        expect(errorSpy.mock.calls[0][1]).toContain(domain);
    });

    // Without these two, "the server gave 404 twice" and "actually left" can't be told apart from the outside.
    it('정지 사유와 연속 실패 수를 함께 싣는다', () => {
        planOf('join')?.onStopped?.({ type: 'join', id: 'ch-1@me' } as never, FAILURE as never, CTX);

        const options = errorSpy.mock.calls[0][2] as { error: unknown; data: Record<string, unknown> };
        expect(options.error).toBe(FAILURE.error);
        expect(options.data).toMatchObject({ domain: 'join', kind: 'gone', failures: 2, goneStreak: 2 });
        expect(options.data.targetId).toBe('ch-1@me');
    });

    it('삭제보다 먼저 기록한다 — 삭제가 던지거나 앱이 죽어도 엔트리는 이미 나갔다', () => {
        const order: string[] = [];
        errorSpy.mockImplementation(() => void order.push('log'));
        const cacheDelete = jest.fn(() => void order.push('delete'));
        mockRepositories.current = { join: { cacheDelete }, chat: { cacheClearByChannelId: jest.fn() } };

        const plan = planOf('join');
        // The lib's onStopped goes through readSnapshot on its way to onRemove.
        plan?.onStopped?.(
            { type: 'join', id: 'ch-1@me' } as never,
            FAILURE as never,
            {
                readSnapshot: () => undefined,
            } as never
        );

        expect(order).toEqual(['log', 'delete']);
    });
});

// The channel plan carries a `decide` so the FIRST refusal can be seen. Supplying one replaces the
// library's default, so what these pin down is that nothing about *when* a target stops moved.
describe('createSyncPlans — 채널 거절 관찰이 중단 시점을 바꾸지 않는다', () => {
    const channelPolicy = () => {
        const plan = createSyncPlans(CLOUD_1).find(candidate => candidate.domain === 'channel');
        expect(plan?.failurePolicy?.decide).toBeDefined();
        return plan!.failurePolicy!;
    };

    const failure = (kind: 'gone' | 'transient', goneStreak: number, id = 'ch-1') => ({
        target: { type: 'channel' as const, id },
        error: new Error('403 FORBIDDEN - not a member of channel'),
        kind,
        failures: goneStreak,
        goneStreak,
    });

    afterEach(() => clearRefusedChannels());

    it('첫 거절은 retry로 두고, 둘째에 stop한다 — 라이브러리 기본값 그대로', () => {
        const policy = channelPolicy();

        expect(policy.decide!(failure('gone', 1))).toBe('retry');
        expect(policy.decide!(failure('gone', 2))).toBe('stop');
        expect(policy.stopAfter).toBe(2);
    });

    it('연결 문제(transient)는 몇 번이든 retry다', () => {
        const policy = channelPolicy();

        expect(policy.decide!(failure('transient', 0))).toBe('retry');
        expect(policy.decide!(failure('transient', 0))).toBe('retry');
    });

    // The point of the whole hook: the room can answer on the first refusal, not the second.
    it('첫 거절에서 이미 기억한다 — 중단을 기다리지 않는다', () => {
        const policy = channelPolicy();

        policy.decide!(failure('gone', 1));

        expect(isChannelRefused('ch-1')).toBe(true);
    });

    // A dead socket is not a membership fact, and saying so would lie to somebody who is offline.
    it('transient은 기억하지 않는다', () => {
        const policy = channelPolicy();

        policy.decide!(failure('transient', 0, 'ch-2'));

        expect(isChannelRefused('ch-2')).toBe(false);
    });
});

/**
 * A plan callback hands its cache write off and moves on, so a rejected write used to vanish as an
 * unhandled rejection: somebody else's edit, delete or new message was lost with nothing in the log.
 * The write itself is still not retried here (the plan has already advanced its snapshot), so what
 * these pin down is that the failure reaches the log, and that it does so for every hand-off.
 */
describe('plan cache writes — a failed write is logged, not lost', () => {
    // Installed in `beforeAll`, not at collection time: the suite above restores the same spy in its
    // own `afterAll`, which would take this one down with it.
    let errorSpy: jest.SpyInstance;
    beforeAll(() => {
        errorSpy = jest.spyOn(logger, 'error').mockImplementation();
    });
    const failure = new Error('disk full');

    // The hand-off settles on a later microtask turn.
    const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

    beforeEach(() => {
        errorSpy.mockClear();
        mockScopedContext.current = cid => ({ cid, uid: 'me', socketCid: cid });
    });

    afterAll(() => errorSpy.mockRestore());

    const optionsOf = (domain: string) =>
        (
            createSyncPlans(CLOUD_1).find(candidate => candidate.domain === domain) as unknown as {
                options: Record<string, (...args: unknown[]) => void>;
            }
        ).options;

    const CHAT_VIEW = { id: 'ch-1:7', channelId: 'ch-1', chatNo: 7 };

    it('logs a rejected batch write of arriving messages', async () => {
        mockRepositories.current = { chat: { cacheWriteMany: jest.fn().mockRejectedValue(failure) } };

        optionsOf('chat').onApply({ type: 'chat', id: 'ch-1' }, [CHAT_VIEW], {});
        await flush();

        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0][0]).toBe('SYNC');
        expect(errorSpy.mock.calls[0][1]).toContain('chat apply');
        expect((errorSpy.mock.calls[0][2] as { error: unknown }).error).toBe(failure);
    });

    it("logs a rejected write of somebody else's edit or delete", async () => {
        mockRepositories.current = { chat: { cacheWrite: jest.fn().mockRejectedValue(failure) } };

        optionsOf('chat').onUpdate({ type: 'chat', id: 'ch-1' }, { ...CHAT_VIEW, hidden: true }, {});
        await flush();

        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0][1]).toContain('chat update');
    });

    it('logs a repository that throws before it returns a promise', async () => {
        mockRepositories.current = {
            chat: {
                cacheWrite: () => {
                    throw failure;
                },
            },
        };

        expect(() => optionsOf('chat').onUpdate({ type: 'chat', id: 'ch-1' }, CHAT_VIEW, {})).not.toThrow();
        await flush();

        expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('logs the other domains the same way', async () => {
        mockRepositories.current = {
            channel: {
                cacheWrite: jest.fn().mockRejectedValue(failure),
                cacheDelete: jest.fn().mockRejectedValue(failure),
            },
            place: {
                cacheWrite: jest.fn().mockRejectedValue(failure),
                cacheDelete: jest.fn().mockRejectedValue(failure),
            },
            profile: {
                cacheWrite: jest.fn().mockRejectedValue(failure),
                cacheDelete: jest.fn().mockRejectedValue(failure),
            },
            join: {
                cacheWrite: jest.fn().mockRejectedValue(failure),
                cacheDelete: jest.fn().mockRejectedValue(failure),
            },
            chat: { cacheClearByChannelId: jest.fn().mockRejectedValue(failure) },
        };

        optionsOf('channel').onUpdate({ type: 'channel', id: 'ch-1' }, { id: 'ch-1' });
        optionsOf('channel').onRemove({ type: 'channel', id: 'ch-1' });
        optionsOf('place').onUpdate({ type: 'place', id: 'pl-1' }, { id: 'pl-1' });
        optionsOf('place').onRemove({ type: 'place', id: 'pl-1' });
        optionsOf('profile').onUpdate({ type: 'profile', id: 'u-1' }, { id: 'u-1' });
        optionsOf('profile').onRemove({ type: 'profile', id: 'u-1' });
        optionsOf('join').onUpdate({ type: 'join', id: 'ch-1@me' }, { id: 'ch-1@me' });
        optionsOf('join').onRemove({ type: 'join', id: 'ch-1@me' });
        await flush();

        // The join removal is mine, so it also clears the room's cached messages.
        expect(errorSpy.mock.calls.map(call => call[1])).toEqual([
            expect.stringContaining('channel update'),
            expect.stringContaining('channel remove'),
            expect.stringContaining('place update'),
            expect.stringContaining('place remove'),
            expect.stringContaining('profile update'),
            expect.stringContaining('profile remove'),
            expect.stringContaining('join update'),
            expect.stringContaining('join remove'),
            expect.stringContaining('chat clear on leave'),
        ]);
    });

    it('stays quiet when the writes succeed', async () => {
        mockRepositories.current = { chat: { cacheWriteMany: jest.fn().mockResolvedValue(undefined) } };

        optionsOf('chat').onApply({ type: 'chat', id: 'ch-1' }, [CHAT_VIEW], {});
        await flush();

        expect(errorSpy).not.toHaveBeenCalled();
    });
});
