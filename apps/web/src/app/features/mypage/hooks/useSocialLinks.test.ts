import { act, renderHook, waitFor } from '@testing-library/react';

import { useSessionIdentity } from '@chatic/web-core';
import { isNative } from '@chatic/bridges';

import { readLinkedProviders, useSocialLinks } from './useSocialLinks';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

jest.mock('@chatic/web-core', () => ({ useSessionIdentity: jest.fn() }));

jest.mock('@chatic/bridges', () => ({
    isNative: jest.fn(),
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const toastMock = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));

const oauthLoginMock = jest.fn();
jest.mock('../../../bridge', () => ({
    appBridge: { oauthLogin: (provider: string) => oauthLoginMock(provider) },
}));

const attachMock = jest.fn();
jest.mock('../../../hooks', () => ({ useAttachSocial: () => ({ attach: attachMock, isPending: false }) }));

const STORAGE_KEY = 'chatic-linked-social-providers';
const mockIsNative = isNative as jest.MockedFunction<typeof isNative>;
const mockUseSessionIdentity = useSessionIdentity as jest.MockedFunction<typeof useSessionIdentity>;

const setSessionUser = (userId: string | null) => {
    mockUseSessionIdentity.mockReturnValue({
        isInitialized: true,
        isAuthenticated: !!userId,
        error: null,
        userId,
        delegatorId: null,
    });
};

beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockIsNative.mockReturnValue(true);
    setSessionUser('user-1');
});

describe('useSocialLinks', () => {
    it('아무 것도 연동되지 않은 상태에서 시작한다', () => {
        const { result } = renderHook(() => useSocialLinks());

        expect(result.current.isLinked('google')).toBe(false);
        expect(result.current.isLinked('apple')).toBe(false);
    });

    it('attach 성공 시 로컬 캐시에 기록하고 isLinked가 true로 바뀐다', async () => {
        oauthLoginMock.mockResolvedValue({ data: { result: { provider: 'google', idToken: 'tok' } } });
        attachMock.mockResolvedValue({ attached: true });

        const { result } = renderHook(() => useSocialLinks());
        await act(async () => {
            await result.current.linkProvider('google');
        });

        expect(attachMock).toHaveBeenCalledWith({ provider: 'google', idToken: 'tok' });
        expect(result.current.isLinked('google')).toBe(true);
        expect(readLinkedProviders('user-1')).toEqual(['google']);
        expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'mypage.accountInfo.social.linkSuccess' }));
    });

    it('네이티브 OAuth 취소(null)는 attach를 호출하지 않고 캐시도 바꾸지 않는다', async () => {
        oauthLoginMock.mockResolvedValue({ data: { result: null } });

        const { result } = renderHook(() => useSocialLinks());
        await act(async () => {
            await result.current.linkProvider('google');
        });

        expect(attachMock).not.toHaveBeenCalled();
        expect(result.current.isLinked('google')).toBe(false);
        expect(toastMock).not.toHaveBeenCalled();
    });

    it('409(이미 다른 계정 소유)는 전용 문구로 에러 토스트를 띄우고 캐시를 바꾸지 않는다', async () => {
        oauthLoginMock.mockResolvedValue({ data: { result: { provider: 'google', idToken: 'tok' } } });
        attachMock.mockRejectedValue(new Error('409 CONFLICT - already linked'));

        const { result } = renderHook(() => useSocialLinks());
        await act(async () => {
            await result.current.linkProvider('google');
        });

        expect(result.current.isLinked('google')).toBe(false);
        expect(toastMock).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'mypage.accountInfo.social.alreadyLinkedElsewhere',
                variant: 'destructive',
            })
        );
    });

    it('그 외 실패는 일반 실패 문구로 에러 토스트를 띄운다', async () => {
        oauthLoginMock.mockResolvedValue({ data: { result: { provider: 'google', idToken: 'tok' } } });
        attachMock.mockRejectedValue(new Error('500 INTERNAL'));

        const { result } = renderHook(() => useSocialLinks());
        await act(async () => {
            await result.current.linkProvider('google');
        });

        expect(toastMock).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'mypage.accountInfo.social.linkFailed', variant: 'destructive' })
        );
    });

    it('네이티브가 아니면 oauthLogin을 부르지 않고 안내 토스트만 띄운다', async () => {
        mockIsNative.mockReturnValue(false);

        const { result } = renderHook(() => useSocialLinks());
        await act(async () => {
            await result.current.linkProvider('google');
        });

        expect(oauthLoginMock).not.toHaveBeenCalled();
        expect(attachMock).not.toHaveBeenCalled();
        expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'mypage.accountInfo.social.mobileOnly' }));
    });

    it('requestUnlink은 스텁이다 — 캐시를 바꾸지 않고 안내 토스트만 띄운다', async () => {
        oauthLoginMock.mockResolvedValue({ data: { result: { provider: 'google', idToken: 'tok' } } });
        attachMock.mockResolvedValue({ attached: true });

        const { result } = renderHook(() => useSocialLinks());
        await act(async () => {
            await result.current.linkProvider('google');
        });
        expect(result.current.isLinked('google')).toBe(true);

        act(() => result.current.requestUnlink());

        // Still linked — the stub never mutates state, so no false "unlinked" report.
        expect(result.current.isLinked('google')).toBe(true);
        expect(toastMock).toHaveBeenLastCalledWith(
            expect.objectContaining({ title: 'mypage.accountInfo.social.unlinkComingSoon' })
        );
    });

    it('다른 uid의 캐시는 새 uid에 보이지 않는다 (계정 스코프)', async () => {
        oauthLoginMock.mockResolvedValue({ data: { result: { provider: 'google', idToken: 'tok' } } });
        attachMock.mockResolvedValue({ attached: true });

        const { result, rerender } = renderHook(() => useSocialLinks());
        await act(async () => {
            await result.current.linkProvider('google');
        });
        expect(result.current.isLinked('google')).toBe(true);

        setSessionUser('user-2');
        rerender();

        expect(result.current.isLinked('google')).toBe(false);
    });

    it('손상된 로컬 캐시 JSON은 빈 상태로 방어한다', () => {
        localStorage.setItem(STORAGE_KEY, '{not-json');

        const { result } = renderHook(() => useSocialLinks());

        expect(result.current.isLinked('google')).toBe(false);
        expect(readLinkedProviders('user-1')).toEqual([]);
    });

    it('uid가 없으면 항상 빈 목록을 돌려준다', () => {
        expect(readLinkedProviders(null)).toEqual([]);
        expect(readLinkedProviders(undefined)).toEqual([]);
    });

    it('waitFor로 attach 완료 후 isLinking이 다시 false인지 확인한다', async () => {
        oauthLoginMock.mockResolvedValue({ data: { result: { provider: 'google', idToken: 'tok' } } });
        attachMock.mockResolvedValue({ attached: true });

        const { result } = renderHook(() => useSocialLinks());
        expect(result.current.isLinking).toBe(false);

        await act(async () => {
            await result.current.linkProvider('google');
        });

        await waitFor(() => expect(result.current.isLinking).toBe(false));
    });
});
