// plans.ts → data/runtime.ts → DataManager.ts → httpFactory.ts imports `@chatic/http`'s transport as
// a value (webTransport). That chain used to lead to `@chatic/web-config` (an import.meta holder that
// ts-jest's CJS parser can't handle), but now leads to `@chatic/config` (import.meta count 0), so
// parsing is no longer the problem — this mock is kept anyway, to cut and isolate the session
// dependency this test doesn't actually use.
import { logger } from '@chatic/bridges';

import { createSyncPlans } from './plans';

jest.mock('../../session', () => new Proxy({}, { get: () => jest.fn() }));
// Only the data-runtime accessors are cut — `toDomainChat` has to be the real thing, because that's
// the only way to see whether `hidden` survives the mapping. The socket runtime needs no mock: the
// bound cloud comes in as `createSyncPlans`'s argument. `jest.mock` only hoists from the top of the
// file, so this lives here rather than inside a describe. The snapshot contract test above never
// calls these accessors, so it's unaffected.
//
// Registration happens **once** per module. Registering the same module twice lets the later one win
// silently, so any value that a suite needs to swap answers for lives in a holder the factory reads —
// that's how this one file holds two suites together.
const mockCacheWrite = jest.fn();
const mockBoundCid: { current: string | null } = { current: 'cloud-1' };
const mockDataContext: { current: { cid: string; uid?: string } } = { current: { cid: 'cloud-1', uid: 'user-1' } };
/** `null` means the chat-change suite's default repositories are used. */
const mockRepositories: { current: Record<string, unknown> | null } = { current: null };
jest.mock('../../data/runtime', () => ({
    getDataManager: () => ({ getContext: () => mockDataContext.current }),
    getRepositories: () =>
        mockRepositories.current ?? { chat: { cacheWrite: mockCacheWrite, cacheWriteMany: jest.fn() } },
}));
// createSyncPlans reads its runtime dependencies lazily inside callbacks (see the file-top comment),
// so just creating plans and calling the onConnected hook needs no socket/data runtime at all — the
// reason this contract test can exist.
describe('createSyncPlans — 재연결 스냅샷 유지 (ADR-0059)', () => {
    it.each(['channel', 'place', 'profile', 'join'] as const)(
        '%s plan은 onConnected에서 스냅샷을 리셋하지 않는다',
        domain => {
            const plan = createSyncPlans(() => mockBoundCid.current).find(candidate => candidate.domain === domain);
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
        const plan = createSyncPlans(() => mockBoundCid.current).find(
            candidate => candidate.domain === 'chat'
        ) as unknown as {
            options?: { onUpdate?: (target: unknown, changed: unknown, snapshot: unknown) => void };
        };
        return plan?.options?.onUpdate;
    };

    beforeEach(() => {
        mockCacheWrite.mockClear();
        mockBoundCid.current = 'cloud-1';
        mockDataContext.current = { cid: 'cloud-1', uid: 'user-1' };
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

    it('나가는 클라우드의 프레임은 버린다 — onApply와 같은 가드', () => {
        // Switch's optimistic window: the cache cid has already flipped while the socket is still attached to the old cloud.
        mockBoundCid.current = 'cloud-0';

        chatOnUpdate()?.(
            { type: 'chat', id: 'ch-1' },
            { id: 'ch-1:7', channelId: 'ch-1', chatNo: 7, hidden: true },
            {}
        );

        expect(mockCacheWrite).not.toHaveBeenCalled();
    });
});

describe('join plan onRemove — 퇴장한 방의 메시지 캐시 정리 (ADR-0067)', () => {
    // onRemove only goes in as a plan constructor option and the lib never exposes it publicly. What
    // this wants to verify is not the lib's dispatch but the judgment of the callback we passed, so it
    // pulls that callback out and calls it directly.
    const onRemoveOf = (uid: string | undefined, boundCid: string | null) => {
        const cacheDelete = jest.fn();
        const cacheClearByChannelId = jest.fn();
        mockRepositories.current = { join: { cacheDelete }, chat: { cacheClearByChannelId } };
        mockDataContext.current = { cid: 'cloud-a', uid };
        mockBoundCid.current = boundCid;

        const plan = createSyncPlans(() => mockBoundCid.current).find(candidate => candidate.domain === 'join');
        const onRemove = (plan as unknown as { options: { onRemove: (target: { id: string }) => void } }).options
            .onRemove;
        return { onRemove, cacheDelete, cacheClearByChannelId };
    };

    it('내 join이 사라지면 그 채널의 chat 캐시를 비운다', () => {
        const { onRemove, cacheDelete, cacheClearByChannelId } = onRemoveOf('me', 'cloud-a');

        onRemove({ id: 'ch-1@me' });

        expect(cacheDelete).toHaveBeenCalledWith('ch-1@me');
        expect(cacheClearByChannelId).toHaveBeenCalledWith('ch-1');
    });

    it('다른 멤버의 join이 사라지면 내 chat 캐시는 건드리지 않는다', () => {
        const { onRemove, cacheDelete, cacheClearByChannelId } = onRemoveOf('me', 'cloud-a');

        onRemove({ id: 'ch-1@someone-else' });

        expect(cacheDelete).toHaveBeenCalledWith('ch-1@someone-else');
        expect(cacheClearByChannelId).not.toHaveBeenCalled();
    });

    it('소켓이 다른 클라우드에 묶여 있으면 비우지 않는다', () => {
        // Deleting messages is not undoable — a frame from a socket that outlived its own cloud must
        // not be allowed to aim at the current cloud's partition. The tombstone is left as existing behavior.
        const { onRemove, cacheDelete, cacheClearByChannelId } = onRemoveOf('me', 'cloud-b');

        onRemove({ id: 'ch-1@me' });

        expect(cacheDelete).toHaveBeenCalledWith('ch-1@me');
        expect(cacheClearByChannelId).not.toHaveBeenCalled();
    });

    it('합성 id가 아니면 아무것도 비우지 않는다', () => {
        const { onRemove, cacheClearByChannelId } = onRemoveOf('me', 'cloud-a');

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
        mockDataContext.current = { cid: 'cloud-a', uid: 'me' };
        mockBoundCid.current = 'cloud-a';
    });

    afterAll(() => errorSpy.mockRestore());

    const planOf = (domain: string) =>
        createSyncPlans(() => mockBoundCid.current).find(candidate => candidate.domain === domain);

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
