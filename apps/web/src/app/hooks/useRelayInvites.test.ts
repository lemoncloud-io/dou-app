/**
 * Contract tests for Track 0's relay-invite hooks (ADR-0033 인터페이스 계약).
 *
 * The seam under test is the gateway boundary: these hooks own the packet BODY they hand the
 * relay-pinned invite gateway, the `invite.list` envelope they unwrap, and which cache entries a
 * mutation invalidates. Where those packets are SENT is fixed one layer down and covered there
 * (`libs/app-runtime/.../remoteFactory.test.ts`), so it is not re-asserted here.
 *
 * Every downstream suite mocks these hooks, which is why they need direct coverage: nothing else
 * would notice if the envelope key, the state filter, or an invalidation key drifted.
 */
import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useKindVerified, useRuntimeRepositories } from '@chatic/app-runtime';

import { relayInviteKeys, useRelayInviteMutations, useRelayInvites } from './useRelayInvites';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn(), useKindVerified: jest.fn() }));

const list = jest.fn();
const create = jest.fn();
const get = jest.fn();
const accept = jest.fn();
const cancel = jest.fn();
const reject = jest.fn();

/** Mirrors the app's QueryClient defaults (app.tsx) — `staleTime: Infinity` is load-bearing below. */
const createAppQueryClient = () =>
    new QueryClient({
        defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });

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
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ invite: { list, create, get, accept, cancel, reject } });
    (useKindVerified as jest.Mock).mockReturnValue(true); // relay verified by default in these tests
    queryClient = createAppQueryClient();
    focusManager.setFocused(undefined);
});

describe('useRelayInvites', () => {
    // 봉투 벗기기는 InviteRemoteDataSource의 계약이고 거기서 검증된다 — 여기서는 리포지토리가
    // 준 배열이 그대로 노출되는지, 그리고 undefined가 UI로 새지 않는지만 본다.
    it('리포지토리가 준 배열을 그대로 노출한다', async () => {
        list.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

        const { result } = renderHook(() => useRelayInvites(), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.invites).toEqual([{ id: 'a' }, { id: 'b' }]);
    });

    it('state 인자가 없어도 limit은 항상 실린다 — 서버 기본 페이지가 목록을 잘라먹지 않게', async () => {
        const { result } = renderHook(() => useRelayInvites(), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(list).toHaveBeenCalledWith({ limit: 100 });
    });

    it('state 인자는 필터로 실려 나가고, 캐시 키도 state별로 갈린다', async () => {
        const { result } = renderHook(() => useRelayInvites('pending'), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(list).toHaveBeenCalledWith({ limit: 100, state: 'pending' });
        expect(relayInviteKeys.list('pending')).not.toEqual(relayInviteKeys.list());
        expect(queryClient.getQueryData(relayInviteKeys.list('pending'))).toEqual([]);
    });

    it('창 포커스 복귀 시 다시 조회한다 — 앱 전역 staleTime: Infinity 아래에서도', async () => {
        // 수락은 남의 기기에서 일어나고 알림 패킷이 없다(백엔드 요청 #4). 전역 기본값만 믿으면
        // 쿼리가 영원히 fresh라 포커스 refetch가 죽는다 — 이 훅이 staleTime을 직접 끄는 이유다.
        const { result } = renderHook(() => useRelayInvites(), { wrapper });
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
        (useKindVerified as jest.Mock).mockReturnValue(false);

        const { result } = renderHook(() => useRelayInvites(), { wrapper });

        expect(list).not.toHaveBeenCalled();
        expect(result.current.isLoading).toBe(false); // not stuck in a spinner while gated off
    });

    it('relay verified가 false→true로 바뀌는 순간 조회한다', async () => {
        (useKindVerified as jest.Mock).mockReturnValue(false);
        const { result, rerender } = renderHook(() => useRelayInvites(), { wrapper });
        expect(list).not.toHaveBeenCalled();

        (useKindVerified as jest.Mock).mockReturnValue(true);
        rerender();

        await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
        expect(result.current.invites).toEqual([]);
    });
});

describe('useRelayInviteMutations', () => {
    const renderBoth = () =>
        renderHook(
            () => ({
                invites: useRelayInvites(),
                mutations: useRelayInviteMutations(),
            }),
            { wrapper }
        );

    it('createInvite는 { phone, name }을 그대로 보내고 발급된 뷰를 돌려준다', async () => {
        const { result } = renderHook(() => useRelayInviteMutations(), { wrapper });

        const issued = await result.current.createInvite({ phone: '01012345678', name: '홍길동' });

        expect(create).toHaveBeenCalledWith({ phone: '01012345678', name: '홍길동' });
        expect(issued).toEqual({ id: 'invite-1' });
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
                any: useRelayInvites(),
                pending: useRelayInvites('pending'),
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
