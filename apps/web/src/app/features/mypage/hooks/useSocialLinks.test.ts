import { act, renderHook } from '@testing-library/react';

import { isNative } from '@chatic/bridges';

import type { LinkedAccounts } from '../../../hooks';
import { useSocialLinks } from './useSocialLinks';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

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

const verifySocialMock = jest.fn();
const confirmSocialMock = jest.fn();
/** Whether a link call is in flight — the hook forwards this as `isLinking`. */
let mockIsLinkingSocial = false;
/** What the server says this account has proved (`link$`), as `useLinkedAccounts` reads it. */
let mockLinked: LinkedAccounts = { phone: 'absent', social: 'absent' };

jest.mock('../../../hooks', () => ({
    useLinkAccount: () => ({
        send: jest.fn(),
        verify: jest.fn(),
        confirm: jest.fn(),
        verifySocial: verifySocialMock,
        confirmSocial: confirmSocialMock,
        isSending: false,
        isVerifying: false,
        isConfirming: false,
        isLinkingSocial: mockIsLinkingSocial,
    }),
    useLinkedAccounts: () => mockLinked,
}));

const mockIsNative = isNative as jest.MockedFunction<typeof isNative>;

const GOOGLE_TOKENS = { provider: 'google', idToken: 'tok' };

beforeEach(() => {
    jest.clearAllMocks();
    mockIsNative.mockReturnValue(true);
    mockIsLinkingSocial = false;
    mockLinked = { phone: 'absent', social: 'absent' };
    oauthLoginMock.mockResolvedValue({ data: { result: { idToken: 'tok' } } });
    verifySocialMock.mockResolvedValue({ linkable: true });
    confirmSocialMock.mockResolvedValue({ linked: true });
});

describe('useSocialLinks — 연동 상태 (link$가 원본)', () => {
    it('서버가 소셜을 담아 두지 않았으면 아무 것도 연동되지 않은 상태다', () => {
        const { result } = renderHook(() => useSocialLinks());

        expect(result.current.isLinked('google')).toBe(false);
        expect(result.current.isLinked('apple')).toBe(false);
        expect(result.current.socialState).toBe('absent');
    });

    it('link$에 기록된 provider만 연동으로 읽는다 — 슬롯은 하나뿐이다', () => {
        mockLinked = { phone: 'linked', social: 'linked', socialProvider: 'google' };

        const { result } = renderHook(() => useSocialLinks());

        expect(result.current.isLinked('google')).toBe(true);
        // 다른 provider는 연동 안 된 것으로 읽힌다 — 서버도 `type-linked`로 막는다.
        expect(result.current.isLinked('apple')).toBe(false);
    });

    it("서버가 말하기 전('unknown')에는 어느 쪽도 주장하지 않는다 — 섹션이 침묵할 수 있게", () => {
        mockLinked = { phone: 'unknown', social: 'unknown' };

        const { result } = renderHook(() => useSocialLinks());

        expect(result.current.socialState).toBe('unknown');
        expect(result.current.isLinked('google')).toBe(false);
    });

    it('isLinking은 link-account의 진행 상태를 그대로 넘긴다', () => {
        mockIsLinkingSocial = true;

        const { result } = renderHook(() => useSocialLinks());

        expect(result.current.isLinking).toBe(true);
    });
});

describe('useSocialLinks — 연동 (verify → confirm)', () => {
    it('verify로 먼저 물어본 뒤에 confirm한다 — provider를 토큰에 실어 보낸다', async () => {
        const order: string[] = [];
        verifySocialMock.mockImplementation(() => {
            order.push('verify');
            return Promise.resolve({ linkable: true });
        });
        confirmSocialMock.mockImplementation(() => {
            order.push('confirm');
            return Promise.resolve({ linked: true });
        });

        const { result } = renderHook(() => useSocialLinks());
        await act(async () => {
            await result.current.linkProvider('google');
        });

        expect(order).toEqual(['verify', 'confirm']);
        expect(verifySocialMock).toHaveBeenCalledWith(GOOGLE_TOKENS);
        expect(confirmSocialMock).toHaveBeenCalledWith(GOOGLE_TOKENS);
        expect(toastMock).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'mypage.accountInfo.social.linkSuccess' })
        );
    });

    it('네이티브 OAuth 취소(null)는 verify도 confirm도 부르지 않고 토스트도 없다', async () => {
        oauthLoginMock.mockResolvedValue({ data: { result: null } });

        const { result } = renderHook(() => useSocialLinks());
        await act(async () => {
            await result.current.linkProvider('google');
        });

        expect(verifySocialMock).not.toHaveBeenCalled();
        expect(confirmSocialMock).not.toHaveBeenCalled();
        expect(toastMock).not.toHaveBeenCalled();
    });

    it('linkable:false(type-linked)는 confirm 전에 멈추고 "이미 다른 계정을 연동" 문구를 띄운다', async () => {
        verifySocialMock.mockResolvedValue({ linkable: false, reason: 'type-linked' });

        const { result } = renderHook(() => useSocialLinks());
        await act(async () => {
            await result.current.linkProvider('google');
        });

        expect(confirmSocialMock).not.toHaveBeenCalled();
        expect(toastMock).toHaveBeenCalledWith({
            title: 'mypage.accountInfo.social.typeAlreadyLinked',
            variant: 'destructive',
        });
    });

    it('linkable:false(그 외 사유)는 남의 계정에 붙었다고 안내한다', async () => {
        verifySocialMock.mockResolvedValue({ linkable: false, reason: 'occupied' });

        const { result } = renderHook(() => useSocialLinks());
        await act(async () => {
            await result.current.linkProvider('google');
        });

        expect(confirmSocialMock).not.toHaveBeenCalled();
        expect(toastMock).toHaveBeenCalledWith({
            title: 'mypage.accountInfo.social.alreadyLinkedElsewhere',
            variant: 'destructive',
        });
    });

    it('네이티브가 아니면 oauthLogin을 부르지 않고 안내 토스트만 띄운다', async () => {
        mockIsNative.mockReturnValue(false);

        const { result } = renderHook(() => useSocialLinks());
        await act(async () => {
            await result.current.linkProvider('google');
        });

        expect(oauthLoginMock).not.toHaveBeenCalled();
        expect(verifySocialMock).not.toHaveBeenCalled();
        expect(toastMock).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'mypage.accountInfo.social.mobileOnly' })
        );
    });
});

describe('useSocialLinks — 실패 문구', () => {
    it.each([
        [409, 'mypage.accountInfo.social.alreadyLinkedElsewhere'],
        [403, 'mypage.accountInfo.social.typeAlreadyLinked'],
        [500, 'mypage.accountInfo.social.linkFailed'],
    ])('%s는 전용 문구로 에러 토스트를 띄운다', async (code, title) => {
        confirmSocialMock.mockRejectedValue(new Error(`${code} FAILED - link-account`));

        const { result } = renderHook(() => useSocialLinks());
        await act(async () => {
            await result.current.linkProvider('google');
        });

        expect(toastMock).toHaveBeenCalledWith({ title, variant: 'destructive' });
    });

    it('verify 단계의 실패도 같은 문구 표를 쓴다', async () => {
        verifySocialMock.mockRejectedValue(new Error('409 CONFLICT - already linked'));

        const { result } = renderHook(() => useSocialLinks());
        await act(async () => {
            await result.current.linkProvider('google');
        });

        expect(confirmSocialMock).not.toHaveBeenCalled();
        expect(toastMock).toHaveBeenCalledWith({
            title: 'mypage.accountInfo.social.alreadyLinkedElsewhere',
            variant: 'destructive',
        });
    });
});

describe('useSocialLinks — 해제', () => {
    it('requestUnlink은 스텁이다 — 상태를 바꾸지 않고 안내 토스트만 띄운다', () => {
        mockLinked = { phone: 'absent', social: 'linked', socialProvider: 'google' };

        const { result } = renderHook(() => useSocialLinks());
        expect(result.current.isLinked('google')).toBe(true);

        act(() => result.current.requestUnlink());

        // Still linked — the stub never mutates state, so no false "unlinked" report.
        expect(result.current.isLinked('google')).toBe(true);
        expect(toastMock).toHaveBeenLastCalledWith(
            expect.objectContaining({ title: 'mypage.accountInfo.social.unlinkComingSoon' })
        );
    });
});
