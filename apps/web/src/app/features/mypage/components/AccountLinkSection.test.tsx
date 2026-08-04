import '@testing-library/jest-dom';

import { fireEvent, render, screen, within } from '@testing-library/react';

import { isNative } from '@chatic/bridges';

import type { LinkedAccounts, LinkedState } from '../../../hooks';
import type { SocialProvider } from '../hooks';

const linkProvider = jest.fn();
const requestUnlink = jest.fn();
let mockIsGuest = false;
/** What the server says this account has proved (`link$`), as `useLinkedAccounts` reads it. */
let mockLinked: LinkedAccounts = { phone: 'linked', social: 'absent', phoneHint: '1234' };
/**
 * `useSocialLinks().socialState` — the same read as `mockLinked.social`, kept separate so a test can
 * pin the "one unknown silences the whole section" rule from either side.
 */
let mockSocialState: LinkedState = 'absent';
/** Which provider the single server-side social slot holds, or none. */
let mockLinkedProvider: SocialProvider | null = null;
let mockIsLinking = false;
const isLinked = jest.fn((provider: SocialProvider) => mockLinkedProvider === provider);

jest.mock('react-i18next', () => ({
    // Echo the key (with the masked tail appended) so assertions can target keys.
    useTranslation: () => ({ t: (k: string, o?: { last4?: string }) => (o?.last4 ? `${k}|${o.last4}` : k) }),
}));
jest.mock('@chatic/app-runtime', () => ({ useRuntimeProfile: () => ({ isGuest: mockIsGuest }) }));
jest.mock('@chatic/bridges', () => ({ isNative: jest.fn() }));
jest.mock('../../../hooks', () => ({ useLinkedAccounts: () => mockLinked }));
jest.mock('../hooks', () => ({
    useSocialLinks: () => ({
        isLinked,
        linkProvider,
        requestUnlink,
        isLinking: mockIsLinking,
        socialState: mockSocialState,
    }),
}));
// Stubbed like ContactInvitePage.test.tsx does: the sheet's own rendering is covered by
// PhoneVerifySheet.test.tsx, and the real one pulls @chatic/app-runtime's applySessionToken plus the
// Radix Sheet primitives. `mode` is surfaced because it is this section's decision (ADR-0042 §3).
jest.mock('../../auth/components/PhoneVerifySheet', () => ({
    PhoneVerifySheet: ({ mode, onVerified, onClose }: any) => (
        <div>
            <span>phone-sheet:{mode}</span>
            <button onClick={onVerified}>sheet-verified</button>
            <button onClick={onClose}>sheet-close</button>
        </div>
    ),
}));

import { AccountLinkSection } from './AccountLinkSection';

const mockIsNative = isNative as jest.MockedFunction<typeof isNative>;

const PHONE = 'mypage.accountInfo.social.phone';
const LINK = 'mypage.accountInfo.social.link';
const LINKED = 'mypage.accountInfo.social.linked';
const NUDGE = 'mypage.accountInfo.social.bannerTitle';

/** The row a credential lives in — label span + its trailing control. */
const row = (label: string) => screen.getByText(label).closest('div') as HTMLElement;

beforeEach(() => {
    jest.clearAllMocks();
    mockIsNative.mockReturnValue(true);
    mockIsGuest = false;
    mockLinked = { phone: 'linked', social: 'absent', phoneHint: '1234' };
    mockSocialState = 'absent';
    mockLinkedProvider = null;
    mockIsLinking = false;
    window.CHATIC_APP_PLATFORM = 'android';
});

describe('AccountLinkSection — 서버가 말하기 전에는 침묵한다 (ADR-0042 §5)', () => {
    it("소셜이 'unknown'이면 아무것도 렌더하지 않는다 — 연동됐다고도, 연동하라고도 말하지 않는다", () => {
        mockSocialState = 'unknown';
        mockLinked = { phone: 'linked', social: 'unknown', phoneHint: '1234' };

        const { container } = render(<AccountLinkSection />);

        expect(container).toBeEmptyDOMElement();
    });

    it("번호가 'unknown'이면 소셜을 알더라도 섹션 전체가 침묵한다 — 같은 읽기에 얹혀 있다", () => {
        mockLinked = { phone: 'unknown', social: 'absent' };

        const { container } = render(<AccountLinkSection />);

        expect(container).toBeEmptyDOMElement();
    });

    it('게스트에게는 아무것도 렌더하지 않는다 — 연동은 메인 유저 세션의 일이다', () => {
        mockIsGuest = true;

        const { container } = render(<AccountLinkSection />);

        expect(container).toBeEmptyDOMElement();
    });

    it('서버가 두 슬롯을 모두 말했으면 섹션이 열린다', () => {
        render(<AccountLinkSection />);

        expect(screen.getByText(PHONE)).toBeInTheDocument();
        expect(screen.getByText('Google')).toBeInTheDocument();
    });
});

describe('AccountLinkSection — 계정 갈라짐 안내', () => {
    it('번호도 소셜도 없을 때만 안내를 띄운다', () => {
        mockLinked = { phone: 'absent', social: 'absent' };

        render(<AccountLinkSection />);

        expect(screen.getByText(NUDGE)).toBeInTheDocument();
    });

    it('번호가 있으면 안내하지 않는다 — 이미 되찾을 수단이 하나 있다', () => {
        mockLinked = { phone: 'linked', social: 'absent', phoneHint: '1234' };

        render(<AccountLinkSection />);

        expect(screen.queryByText(NUDGE)).not.toBeInTheDocument();
    });

    it('소셜이 있으면 안내하지 않는다', () => {
        mockLinked = { phone: 'absent', social: 'linked', socialProvider: 'google' };
        mockSocialState = 'linked';
        mockLinkedProvider = 'google';

        render(<AccountLinkSection />);

        expect(screen.queryByText(NUDGE)).not.toBeInTheDocument();
    });
});

describe('AccountLinkSection — 번호 행', () => {
    it('연동된 번호는 서버가 준 마스킹 꼬리만 보여준다', () => {
        mockLinked = { phone: 'linked', social: 'absent', phoneHint: '1234' };

        render(<AccountLinkSection />);

        expect(within(row(PHONE)).getByText('mypage.accountInfo.social.phoneMasked|1234')).toBeInTheDocument();
        expect(within(row(PHONE)).queryByRole('button', { name: LINK })).not.toBeInTheDocument();
    });

    it('꼬리가 없으면 일반 "연동됨"으로 떨어진다 — 빈 괄호를 만들지 않는다', () => {
        mockLinked = { phone: 'linked', social: 'absent' };

        render(<AccountLinkSection />);

        expect(within(row(PHONE)).getByText(LINKED)).toBeInTheDocument();
    });

    it('번호가 없으면 연동하기를 눌러 시트를 link 모드로 연다 — 이미 메인 유저 세션이다', () => {
        mockLinked = { phone: 'absent', social: 'absent' };

        render(<AccountLinkSection />);
        expect(screen.queryByText(/^phone-sheet:/)).not.toBeInTheDocument();

        fireEvent.click(within(row(PHONE)).getByRole('button', { name: LINK }));

        expect(screen.getByText('phone-sheet:link')).toBeInTheDocument();
    });

    it('인증을 마치면 시트를 닫는다', () => {
        mockLinked = { phone: 'absent', social: 'absent' };

        render(<AccountLinkSection />);
        fireEvent.click(within(row(PHONE)).getByRole('button', { name: LINK }));
        fireEvent.click(screen.getByText('sheet-verified'));

        expect(screen.queryByText(/^phone-sheet:/)).not.toBeInTheDocument();
    });

    it('번호 행에는 해제가 없다 — 뗄 엔드포인트도 없다', () => {
        render(<AccountLinkSection />);

        expect(
            within(row(PHONE)).queryByRole('button', { name: 'mypage.accountInfo.social.unlink' })
        ).not.toBeInTheDocument();
    });
});

describe('AccountLinkSection — 소셜 행', () => {
    it('isLinked가 그 provider를 가리킬 때만 연동됨으로 그린다', () => {
        mockLinked = { phone: 'linked', social: 'linked', socialProvider: 'google', phoneHint: '1234' };
        mockSocialState = 'linked';
        mockLinkedProvider = 'google';

        render(<AccountLinkSection />);

        expect(within(row('Google')).getByText(LINKED)).toBeInTheDocument();
        expect(within(row('Google')).queryByRole('button', { name: LINK })).not.toBeInTheDocument();
        expect(isLinked).toHaveBeenCalledWith('google');
    });

    it('연동되지 않았으면 연동하기가 그 provider로 링크를 시작한다', () => {
        render(<AccountLinkSection />);

        fireEvent.click(within(row('Google')).getByRole('button', { name: LINK }));

        expect(linkProvider).toHaveBeenCalledWith('google');
    });

    it('링크가 진행 중이면 연동하기를 막는다', () => {
        mockIsLinking = true;

        render(<AccountLinkSection />);

        expect(within(row('Google')).getByRole('button', { name: LINK })).toBeDisabled();
    });

    it('해제 버튼은 비활성이다 — 엔드포인트가 없으니 성공을 흉내내지 않는다', () => {
        mockLinked = { phone: 'linked', social: 'linked', socialProvider: 'google', phoneHint: '1234' };
        mockSocialState = 'linked';
        mockLinkedProvider = 'google';

        render(<AccountLinkSection />);

        expect(within(row('Google')).getByRole('button', { name: 'mypage.accountInfo.social.unlink' })).toBeDisabled();
        expect(requestUnlink).not.toHaveBeenCalled();
    });

    it('Apple 행은 iOS 앱에서만 나온다 (LoginPage와 같은 조건)', () => {
        window.CHATIC_APP_PLATFORM = 'ios';

        render(<AccountLinkSection />);

        expect(screen.getByText('Apple')).toBeInTheDocument();
    });

    it('네이티브가 아니면 Apple 행이 없다', () => {
        mockIsNative.mockReturnValue(false);
        window.CHATIC_APP_PLATFORM = 'ios';

        render(<AccountLinkSection />);

        expect(screen.queryByText('Apple')).not.toBeInTheDocument();
        expect(screen.getByText('Google')).toBeInTheDocument();
    });
});
