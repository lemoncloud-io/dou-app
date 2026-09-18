/**
 * Contract tests for Track 0's relay-invite hooks (ADR-0089 interface contract).
 *
 * The seam under test is the gateway boundary: these hooks own the packet BODY they hand the
 * relay-pinned invite gateway, the `invite.list` envelope they unwrap, and which cache entries a
 * mutation invalidates. Where those packets are SENT is fixed one layer down and covered there
 * (`libs/app-runtime/.../socketFactory.test.ts`), so it is not re-asserted here.
 *
 * Every downstream suite mocks these hooks, which is why they need direct coverage: nothing else
 * would notice if the envelope key, the state filter, or an invalidation key drifted.
 */
import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

import { relayInviteKeys, useRelayInviteMutations, useRelayInvites } from './useRelayInvites';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: jest.fn(),
        },
        connection: {
            useKindVerified: jest.fn(),
            getSocketManager: jest.fn(),
        },
    },
}));

const list = jest.fn();
const create = jest.fn();
const get = jest.fn();
const accept = jest.fn();
const cancel = jest.fn();
const reject = jest.fn();
// Cache observer: never emits by default (empty local cache) — a test that wants a cache-first
// render sets a different mock implementation for the individual case.
const observeList = jest.fn(() => () => undefined);
// The one-shot relay gate a caller-driven refetch waits on (SocketManager.waitUntilKindVerified).
const waitUntilKindVerified = jest.fn(async () => false);

/** Mirrors the app's QueryClient defaults (app.tsx) — `staleTime: Infinity` is load-bearing below. */
const createAppQueryClient = () =>
    new QueryClient({
        defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });

/**
 * Opting into the server read. The wire is opt-in since the invite lane moved into
 * `useBackgroundSync` (see `RelayInvitesOptions.remote`), and most of this suite is about what the
 * packet / merge / invalidation do once the wire is OPEN — so those cases render a remote consumer
 * explicitly. The cache-only default has its own block below.
 */
const REMOTE = { remote: true } as const;

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
    jest.clearAllMocks();
    list.mockResolvedValue([]);
    create.mockResolvedValue({ id: 'invite-1' });
    get.mockResolvedValue({ id: 'invite-1', state: 'pending' });
    accept.mockResolvedValue({ id: 'invite-1', state: 'accepted' });
    cancel.mockResolvedValue({ id: 'invite-1', state: 'canceled', canceledAt: 1 });
    reject.mockResolvedValue({ id: 'invite-1', state: 'rejected', rejectedAt: 1 });
    observeList.mockImplementation(() => () => undefined);
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({
        invite: { list, create, get, accept, cancel, reject, observeList },
    });
    (runtime.connection.useKindVerified as jest.Mock).mockReturnValue(true); // relay verified by default in these tests
    waitUntilKindVerified.mockResolvedValue(false);
    (runtime.connection.getSocketManager as jest.Mock).mockReturnValue({ waitUntilKindVerified });
    queryClient = createAppQueryClient();
    focusManager.setFocused(undefined);
});

describe('useRelayInvites', () => {
    // Unwrapping the envelope is InviteSocketDataSource's contract and is verified there — here we
    // only check that the repository's array is exposed as-is, and that undefined never leaks to the UI.
    it('리포지토리가 준 배열을 그대로 노출한다', async () => {
        list.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

        const { result } = renderHook(() => useRelayInvites(undefined, REMOTE), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.invites).toEqual([{ id: 'a' }, { id: 'b' }]);
    });

    it('state 인자가 없어도 limit은 항상 실린다 — 서버 기본 페이지가 목록을 잘라먹지 않게', async () => {
        const { result } = renderHook(() => useRelayInvites(undefined, REMOTE), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(list).toHaveBeenCalledWith({ limit: 100 });
    });

    it('state 인자는 필터로 실려 나가고, 캐시 키도 state별로 갈린다', async () => {
        const { result } = renderHook(() => useRelayInvites('pending', REMOTE), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(list).toHaveBeenCalledWith({ limit: 100, state: 'pending' });
        expect(relayInviteKeys.list('pending')).not.toEqual(relayInviteKeys.list());
        expect(queryClient.getQueryData(relayInviteKeys.list('pending'))).toEqual([]);
    });

    it('원격 소비자는 창 포커스 복귀 시 다시 조회한다 — 앱 전역 staleTime: Infinity 아래에서도', async () => {
        // Acceptance happens on someone else's device and there's no notification packet for it
        // (backend request #4). Relying solely on the global default keeps the query fresh forever,
        // killing focus refetch — which is why this hook turns off staleTime itself.
        // A cache-only consumer (the default) never runs the query in the first place, so it gets no
        // refetch either — see the block below.
        const { result } = renderHook(() => useRelayInvites(undefined, REMOTE), { wrapper });
        await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

        act(() => focusManager.setFocused(false));
        act(() => focusManager.setFocused(true));

        await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
        expect(result.current.invites).toEqual([]);
    });

    // The bug this hook used to hit: invite.list is relay-pinned, but this query had no gate at
    // all, so it fired on mount and raced the relay handshake — surfacing as `503 SOCKET NOT
    // CONNECTED - relay.request(invite.list)` in production.
    it('relay가 아직 verified가 아니면 조회하지 않는다', () => {
        (runtime.connection.useKindVerified as jest.Mock).mockReturnValue(false);

        const { result } = renderHook(() => useRelayInvites(undefined, REMOTE), { wrapper });

        expect(list).not.toHaveBeenCalled();
        expect(result.current.isLoading).toBe(false); // not stuck in a spinner while gated off
    });

    // The bug from when the waiting screen's 30-second re-fetch was a manual refetch() timer:
    // refetch() fires even on a disabled query, so it caused `401 UNAUTHORIZED - not authenticated
    // @invite.list` during the relay-unauthenticated window. Passing polling as a query option keeps
    // the gate applied as-is.
    it('pollIntervalMs 폴링은 relay 게이트를 지킨다', async () => {
        jest.useFakeTimers();
        (runtime.connection.useKindVerified as jest.Mock).mockReturnValue(false);

        const { rerender } = renderHook(() => useRelayInvites(undefined, { pollIntervalMs: 30_000 }), { wrapper });
        await act(async () => {
            jest.advanceTimersByTime(120_000);
        });
        expect(list).not.toHaveBeenCalled();

        (runtime.connection.useKindVerified as jest.Mock).mockReturnValue(true);
        rerender();
        await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

        await act(async () => {
            jest.advanceTimersByTime(30_000);
        });
        await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
        jest.useRealTimers();
    });

    it('폴링을 요청하지 않은 소비자는 주기 조회를 하지 않는다', async () => {
        jest.useFakeTimers();
        const { result } = renderHook(() => useRelayInvites(undefined, REMOTE), { wrapper });
        await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

        await act(async () => {
            jest.advanceTimersByTime(120_000);
        });
        expect(list).toHaveBeenCalledTimes(1);
        expect(result.current.invites).toEqual([]);
        jest.useRealTimers();
    });

    it('relay verified가 false→true로 바뀌는 순간 조회한다', async () => {
        (runtime.connection.useKindVerified as jest.Mock).mockReturnValue(false);
        const { result, rerender } = renderHook(() => useRelayInvites(undefined, REMOTE), { wrapper });
        expect(list).not.toHaveBeenCalled();

        (runtime.connection.useKindVerified as jest.Mock).mockReturnValue(true);
        rerender();

        await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
        expect(result.current.invites).toEqual([]);
    });
});

describe('useRelayInvites — 캐시 우선 렌더 (ADR-0052)', () => {
    it('원격 응답이 오기 전에는 캐시 행을 그대로 보여주고 로딩 스피너를 띄우지 않는다', () => {
        observeList.mockImplementation(cb => {
            cb({ list: [{ id: 'cached-1', state: 'pending' }], meta: { total: 1, source: 'local' } });
            return () => undefined;
        });
        list.mockReturnValue(new Promise(() => undefined)); // never resolves — simulates cold boot

        const { result } = renderHook(() => useRelayInvites(undefined, REMOTE), { wrapper });

        expect(result.current.invites).toEqual([{ id: 'cached-1', state: 'pending' }]);
        expect(result.current.isLoading).toBe(false);
    });

    it('원격 응답이 오면 겹치는 id는 원격 값(코드 포함)으로 완전히 갈아엎는다', async () => {
        observeList.mockImplementation(cb => {
            cb({ list: [{ id: 'invite-1', state: 'pending' }], meta: { total: 1, source: 'local' } });
            return () => undefined;
        });
        list.mockResolvedValue([{ id: 'invite-1', state: 'accepted', code: 'secret' }]);

        const { result } = renderHook(() => useRelayInvites(undefined, REMOTE), { wrapper });

        // isLoading alone is no longer a reliable "remote responded" signal — a cache hit already
        // clears it before the server answers. Wait for the actual merged value instead.
        await waitFor(() =>
            expect(result.current.invites).toEqual([{ id: 'invite-1', state: 'accepted', code: 'secret' }])
        );
    });

    it('창 밖으로 밀린 캐시 전용 행은 원격 응답 뒤에 이어 붙는다 — 삭제되지 않는다', async () => {
        observeList.mockImplementation(cb => {
            cb({
                list: [
                    { id: 'in-window', state: 'pending' },
                    { id: 'fell-out-of-window', state: 'pending' },
                ],
                meta: { total: 2, source: 'local' },
            });
            return () => undefined;
        });
        list.mockResolvedValue([{ id: 'in-window', state: 'pending', code: 'secret' }]);

        const { result } = renderHook(() => useRelayInvites(undefined, REMOTE), { wrapper });

        await waitFor(() =>
            expect(result.current.invites).toEqual([
                { id: 'in-window', state: 'pending', code: 'secret' },
                { id: 'fell-out-of-window', state: 'pending' },
            ])
        );
    });

    it('캐시가 비어 있고 원격 응답만 있으면 원격 순서를 그대로 통과시킨다', async () => {
        list.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

        const { result } = renderHook(() => useRelayInvites(undefined, REMOTE), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.invites).toEqual([{ id: 'a' }, { id: 'b' }]);
    });

    // Regression point: dismissedAt is a local-only field the server never sends, so applying
    // "remote wins" as-is would make dismiss disappear on every list refetch right after a rejected
    // row was hidden by a reissue (ADR-0052 decision 5, S4 "dismiss is sticky"). The remote value
    // should overwrite the row, but dismissedAt has to be carried over.
    it('원격 응답이 겹치는 id를 갈아엎어도 캐시의 dismissedAt은 살아남는다', async () => {
        observeList.mockImplementation(cb => {
            cb({
                list: [{ id: 'invite-1', state: 'rejected', dismissedAt: 12345 }],
                meta: { total: 1, source: 'local' },
            });
            return () => undefined;
        });
        // The server still ships this invite in the list as rejected — it knows nothing about dismissedAt.
        list.mockResolvedValue([{ id: 'invite-1', state: 'rejected' }]);

        const { result } = renderHook(() => useRelayInvites(undefined, REMOTE), { wrapper });

        await waitFor(() =>
            expect(result.current.invites).toEqual([{ id: 'invite-1', state: 'rejected', dismissedAt: 12345 }])
        );
    });
});

/**
 * Why the default is cache-only: home mounts this hook for EVERY user (`useInviteListRows` →
 * `ChannelList`), including the majority who never sent an invite. With `staleTime: 0` +
 * `refetchOnWindowFocus` that was one relay-pinned `invite.list` per home mount and per window
 * focus for the whole user base — the packet that surfaced every connection-auth desync as
 * `401 UNAUTHORIZED - not authenticated invite.list`. The cadence moved to `useBackgroundSync`,
 * which mirrors its response into the very cache these rows are rendered from.
 */
describe('useRelayInvites — 기본은 캐시 전용', () => {
    it('remote를 요청하지 않으면 relay가 verified여도 소켓을 건드리지 않는다', async () => {
        const { result } = renderHook(() => useRelayInvites(), { wrapper });

        // It doesn't fire because of an absent intent, not a gate — relay is in the verified state.
        expect(runtime.connection.useKindVerified).toHaveBeenCalledWith('relay');
        await act(async () => undefined);
        expect(list).not.toHaveBeenCalled();
        expect(result.current.isLoading).toBe(false); // and it's not stuck in a spinner either
    });

    it('그래도 캐시 행은 그대로 그린다 — 홈 목록은 이 경로만으로 렌더된다', () => {
        observeList.mockImplementation(cb => {
            cb({ list: [{ id: 'cached-1', state: 'pending' }], meta: { total: 1, source: 'local' } });
            return () => undefined;
        });

        const { result } = renderHook(() => useRelayInvites(), { wrapper });

        expect(result.current.invites).toEqual([{ id: 'cached-1', state: 'pending' }]);
        expect(list).not.toHaveBeenCalled();
    });

    it('pollIntervalMs만 줘도 서버 읽기가 켜진다 — 대기 화면은 remote를 따로 안 준다', async () => {
        renderHook(() => useRelayInvites(undefined, { pollIntervalMs: 30_000 }), { wrapper });

        await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    });
});

describe('useRelayInviteMutations', () => {
    const renderBoth = () =>
        renderHook(
            () => ({
                invites: useRelayInvites(undefined, REMOTE),
                mutations: useRelayInviteMutations(),
            }),
            { wrapper }
        );

    // Expiry is attached once here rather than at every call site — omit it and it silently grows to
    // the server default (3 days) (ADR-0068 decision 4).
    it('createInvite는 입력을 그대로 보내고 24시간 만료를 얹는다', async () => {
        const { result } = renderHook(() => useRelayInviteMutations(), { wrapper });

        const issued = await result.current.createInvite({ phone: '01012345678', name: '홍길동' });

        expect(create).toHaveBeenCalledWith({ phone: '01012345678', name: '홍길동', expiresDays: 1 });
        expect(issued).toEqual({ id: 'invite-1' });
    });

    it('호출부가 만료를 지정하면 그것을 쓴다', async () => {
        const { result } = renderHook(() => useRelayInviteMutations(), { wrapper });

        await result.current.createInvite({ phone: '01012345678', name: '홍길동', expiresDays: 7 });

        expect(create).toHaveBeenCalledWith({ phone: '01012345678', name: '홍길동', expiresDays: 7 });
    });

    // A reissue doesn't create a new room — it brings the invitee into the existing room (ADR-0068 decision 2).
    it('channelId를 실으면 그대로 전달한다', async () => {
        const { result } = renderHook(() => useRelayInviteMutations(), { wrapper });

        await result.current.createInvite({ phone: '01012345678', name: '홍길동', channelId: 'ch-1' });

        expect(create).toHaveBeenCalledWith({
            phone: '01012345678',
            name: '홍길동',
            channelId: 'ch-1',
            expiresDays: 1,
        });
    });

    it('getInvite는 코드를 body에만 담아 보내고 needVerify를 그대로 통과시킨다', async () => {
        get.mockResolvedValue({ id: 'invite-1', state: 'pending', needVerify: true });
        const { result } = renderHook(() => useRelayInviteMutations(), { wrapper });

        const view = await result.current.getInvite('invt:1:secret');

        expect(get).toHaveBeenCalledWith('invt:1:secret');
        expect(view.needVerify).toBe(true);
    });

    it('초대 코드는 어떤 캐시 키에도 남지 않는다 — 자격증명이라 devtools에 노출 금지', async () => {
        const { result } = renderHook(() => useRelayInviteMutations(), { wrapper });

        await result.current.getInvite('invt:1:secret');
        await result.current.acceptInvite('invt:1:secret');

        const keys = JSON.stringify(
            queryClient
                .getQueryCache()
                .getAll()
                .map(entry => entry.queryKey)
        );
        expect(keys).not.toContain('secret');
    });

    it('createInvite 성공은 목록 캐시를 무효화해 재조회를 부른다', async () => {
        const { result } = renderBoth();
        await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

        await act(async () => {
            await result.current.mutations.createInvite({ phone: '01012345678', name: '홍길동' });
        });

        await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    });

    it('acceptInvite 성공도 목록 캐시를 무효화한다', async () => {
        const { result } = renderBoth();
        await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

        await act(async () => {
            await result.current.mutations.acceptInvite('invt:1:secret');
        });

        await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    });

    it('무효화는 state별 목록 전부에 걸린다 — all 키가 접두사다', async () => {
        const { result } = renderHook(
            () => ({
                any: useRelayInvites(undefined, REMOTE),
                pending: useRelayInvites('pending', REMOTE),
                mutations: useRelayInviteMutations(),
            }),
            { wrapper }
        );
        await waitFor(() => expect(list).toHaveBeenCalledTimes(2));

        await act(async () => {
            await result.current.mutations.createInvite({ phone: '01012345678', name: '홍길동' });
        });

        await waitFor(() => expect(list).toHaveBeenCalledTimes(4));
    });

    it('cancelInvite는 코드를 body에만 담아 보내고 종국 뷰를 돌려주며 목록을 무효화한다', async () => {
        const { result } = renderBoth();
        await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

        let view: unknown;
        await act(async () => {
            view = await result.current.mutations.cancelInvite('invt:1:secret');
        });

        expect(cancel).toHaveBeenCalledWith('invt:1:secret');
        expect(view).toMatchObject({ state: 'canceled' });
        await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    });

    it('rejectInvite는 코드를 body에만 담아 보내고 종국 뷰를 돌려주며 목록을 무효화한다', async () => {
        const { result } = renderBoth();
        await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

        let view: unknown;
        await act(async () => {
            view = await result.current.mutations.rejectInvite('invt:1:secret');
        });

        expect(reject).toHaveBeenCalledWith('invt:1:secret');
        expect(view).toMatchObject({ state: 'rejected' });
        await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    });

    it('취소·거절의 409(이미 수락)는 그대로 reject된다 — 호출부가 목록 재조회로 수렴시킨다', async () => {
        cancel.mockRejectedValue(new Error('409 CONFLICT - invite is already accepted'));
        const { result } = renderHook(() => useRelayInviteMutations(), { wrapper });

        await expect(result.current.cancelInvite('invt:1:secret')).rejects.toThrow('409 CONFLICT');
    });

    it('getInvite는 읽기라 목록을 무효화하지 않는다 — 스텝마다 불려도 폴링을 흔들지 않는다', async () => {
        const { result } = renderBoth();
        await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

        await act(async () => {
            await result.current.mutations.getInvite('invt:1:secret');
        });

        expect(list).toHaveBeenCalledTimes(1);
    });

    it('만료·이미 수락은 실패가 아니라 state로 온다 — reject하지 않는다', async () => {
        get.mockResolvedValue({ id: 'invite-1', state: 'expired' });
        const { result } = renderHook(() => useRelayInviteMutations(), { wrapper });

        await expect(result.current.getInvite('invt:1:secret')).resolves.toEqual({
            id: 'invite-1',
            state: 'expired',
        });
    });

    it('게이트웨이 실패는 호출자에게 그대로 reject된다 — 에러코드로 분기하도록', async () => {
        create.mockRejectedValue(new Error('403 NOT ALLOWED'));
        const { result } = renderHook(() => useRelayInviteMutations(), { wrapper });

        await expect(result.current.createInvite({ phone: '01012345678', name: '홍길동' })).rejects.toThrow(
            '403 NOT ALLOWED'
        );
    });
});

// This is the refetch that cancel/reissue calls from a cache-only row (no code). react-query's
// refetch() fires even on a disabled query, so exposing it as-is went out during the
// relay-unauthenticated window and the server rejected it with
// `401 UNAUTHORIZED - not authenticated @invite.list` (2 hits per tap, since retry:1).
describe('useRelayInvites — 호출자 refetch도 relay 게이트를 지킨다', () => {
    it('미인증이면 슬롯을 기다리고, 끝내 안 되면 소켓을 건드리지 않는다', async () => {
        (runtime.connection.useKindVerified as jest.Mock).mockReturnValue(false);
        waitUntilKindVerified.mockResolvedValue(false);

        const { result } = renderHook(() => useRelayInvites(), { wrapper });

        const answer = await act(async () => result.current.refetch());

        expect(waitUntilKindVerified).toHaveBeenCalledWith('relay', 3_000);
        expect(list).not.toHaveBeenCalled();
        // Answer with what's on hand — resolveInviteCode only reads the single `data` field.
        expect(answer).toEqual({ data: undefined });
    });

    it('기다리는 동안 relay가 인증되면 그때 조회한다', async () => {
        (runtime.connection.useKindVerified as jest.Mock).mockReturnValue(false);
        waitUntilKindVerified.mockResolvedValue(true);
        list.mockResolvedValue([{ id: 'invite-1', code: 'c0de' }]);

        const { result } = renderHook(() => useRelayInvites(), { wrapper });
        expect(list).not.toHaveBeenCalled(); // the gate is closed at mount time

        const answer = await act(async () => result.current.refetch());

        expect(list).toHaveBeenCalledTimes(1);
        expect(answer.data).toEqual([{ id: 'invite-1', code: 'c0de' }]);
    });

    it('이미 인증돼 있으면 기다리지 않고 바로 조회한다', async () => {
        (runtime.connection.useKindVerified as jest.Mock).mockReturnValue(true);

        // As the default (cache-only) consumer, there's no query on mount — refetch() is the only
        // packet, and the exact TanStack v5 property that it fires even on a disabled query is what
        // makes on-demand code re-fetching possible here.
        const { result } = renderHook(() => useRelayInvites(), { wrapper });
        expect(list).not.toHaveBeenCalled();

        await act(async () => result.current.refetch());

        expect(waitUntilKindVerified).not.toHaveBeenCalled();
        expect(list).toHaveBeenCalledTimes(1);
    });
});
