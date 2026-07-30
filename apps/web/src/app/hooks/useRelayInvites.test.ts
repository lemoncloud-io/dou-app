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

import { useRuntimeGateways } from '@chatic/app-runtime';

import { relayInviteKeys, useRelayInviteMutations, useRelayInvites } from './useRelayInvites';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeGateways: jest.fn() }));

const list = jest.fn();
const create = jest.fn();
const get = jest.fn();
const accept = jest.fn();

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
    list.mockResolvedValue({ list: [] });
    create.mockResolvedValue({ id: 'invite-1' });
    get.mockResolvedValue({ id: 'invite-1', state: 'pending' });
    accept.mockResolvedValue({ id: 'invite-1', state: 'accepted' });
    (useRuntimeGateways as jest.Mock).mockReturnValue({ invite: { list, create, get, accept } });
    queryClient = createAppQueryClient();
    focusManager.setFocused(undefined);
});

describe('useRelayInvites', () => {
    it('invite.list의 { list } 봉투를 벗겨 배열로 노출한다', async () => {
        list.mockResolvedValue({ list: [{ id: 'a' }, { id: 'b' }] });

        const { result } = renderHook(() => useRelayInvites(), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.invites).toEqual([{ id: 'a' }, { id: 'b' }]);
    });

    it('봉투에 list가 없으면 빈 배열이다 — undefined가 UI로 새지 않는다', async () => {
        list.mockResolvedValue({});

        const { result } = renderHook(() => useRelayInvites(), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.invites).toEqual([]);
    });

    it('state 인자가 없으면 필터를 보내지 않는다(null)', async () => {
        const { result } = renderHook(() => useRelayInvites(), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(list).toHaveBeenCalledWith(null);
    });

    it('state 인자는 필터로 실려 나가고, 캐시 키도 state별로 갈린다', async () => {
        const { result } = renderHook(() => useRelayInvites('pending'), { wrapper });

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(list).toHaveBeenCalledWith({ state: 'pending' });
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

        expect(get).toHaveBeenCalledWith({ code: 'invt:1:secret' });
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
