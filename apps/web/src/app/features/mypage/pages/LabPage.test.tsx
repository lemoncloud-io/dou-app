import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { LabPage } from './LabPage';

const openSubWebView = jest.fn();
const toast = jest.fn();
let mockDebugMode = false;
const mockHaptic = jest.fn();
const setPlaceInvite = jest.fn();
const setChatInputLock = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({ settings: { get: () => 'code' } })
);
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@chatic/web-ui-kit', () => ({
    IconChevronRight: () => null,
    Switch: ({
        checked,
        onCheckedChange,
        label,
    }: {
        checked: boolean;
        onCheckedChange: (on: boolean) => void;
        label: string;
    }) => (
        <button
            type="button"
            role="switch"
            aria-label={label}
            aria-checked={checked}
            onClick={() => onCheckedChange(!checked)}
        />
    ),
    MenuCard: ({ title, children }: { title?: string; children: React.ReactNode }) => (
        <section aria-label={title}>{children}</section>
    ),
    ListRow: ({
        title,
        subtitle,
        trailing,
        onClick,
    }: {
        title: string;
        subtitle?: string;
        trailing?: React.ReactNode;
        onClick?: () => void;
    }) => (
        <>
            <button type="button" onClick={onClick}>
                {title} {subtitle}
            </button>
            {trailing}
        </>
    ),
}));
// The real app list, through the barrel's own name for it.
jest.mock('../../../bridge', () => ({
    openSubWebView: (...args: unknown[]) => openSubWebView(...args),
    resolveSubWebViewAppUrl: jest.requireActual('../../../bridge/subWebViewApps').resolveSubWebViewAppUrl,
}));
// `import.meta` is out of reach of the CommonJS transform; the stage is the test's to choose.
jest.mock('../../../utils/buildEnv', () => ({ isDevBuild: () => false }));
jest.mock('../../../hooks', () => ({
    useChatInputLockExperiment: () => ({ isEnabled: false, setEnabled: setChatInputLock }),
    usePlaceInviteExperiment: () => ({ isEnabled: false, setEnabled: setPlaceInvite }),
}));
jest.mock('../../../ui/components', () => ({ PageHeader: () => null }));
jest.mock('../../../bridge/haptics', () => ({ haptics: { play: (kind: string) => mockHaptic(kind) } }));
// The card's own behaviour is MiniAppCard.test.tsx's; here it only has to be placed.
jest.mock('../components/MiniAppCard', () => ({ MiniAppCard: () => <section aria-label="mini app card" /> }));
// The real list, without the policy content the barrel also carries.
jest.mock('../consts', () => jest.requireActual('../consts/inAppPages'));
jest.mock('../../debug', () => ({
    DebugUnlockDialog: () => null,
    debugOverlayActions: { open: jest.fn() },
    useDebugMode: () => ({ isEnabled: mockDebugMode }),
    useDebugUnlock: () => ({
        isChallengeOpen: false,
        hasError: false,
        registerTap: jest.fn(),
        submitCode: jest.fn(),
        cancelChallenge: jest.fn(),
    }),
}));

describe('LabPage — sub WebView pages', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockDebugMode = true;
        openSubWebView.mockResolvedValue({ via: 'subWebView', viewId: 'view-1' });
    });

    it('lists the game in the Experiments card beside the switches', () => {
        render(<LabPage />);

        const experiments = screen.getByRole('region', { name: 'mypage.lab.experiments' });
        expect(
            within(experiments).getByRole('button', { name: /^mypage\.lab\.inAppPages\.enhanceDou\.title / })
        ).toBeTruthy();
        expect(within(experiments).getByRole('button', { name: /^mypage\.lab\.placeInvite / })).toBeTruthy();
        expect(within(experiments).getByRole('button', { name: /^mypage\.lab\.chatInputLock / })).toBeTruthy();
    });

    it('lists the game for everyone, with debug mode off', () => {
        mockDebugMode = false;
        render(<LabPage />);

        expect(screen.getByRole('button', { name: /^mypage\.lab\.inAppPages\.enhanceDou\.title / })).toBeTruthy();
    });

    it('carries the mini app card', () => {
        render(<LabPage />);

        expect(screen.getByRole('region', { name: 'mini app card' })).toBeTruthy();
    });

    it('draws no debug-only card while every page is an experiment', () => {
        render(<LabPage />);

        expect(screen.queryByRole('region', { name: 'mypage.lab.inApp' })).toBeNull();
    });

    it('opens the page tapped in the sub WebView', async () => {
        render(<LabPage />);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /^mypage\.lab\.inAppPages\.enhanceDou\.title / }));
        });

        expect(openSubWebView).toHaveBeenCalledWith({ url: 'https://dou-raise.apps.chatic.io/', appId: 'dou-raise' });
        expect(toast).not.toHaveBeenCalled();
    });

    it('says so when the app refuses to open it', async () => {
        openSubWebView.mockRejectedValue(Object.assign(new Error('nope'), { code: 'NOT_ALLOWED' }));
        render(<LabPage />);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /^mypage\.lab\.inAppPages\.enhanceDou\.title / }));
        });

        expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'mypage.lab.inAppOpenFailed', variant: 'destructive' })
        );
    });

    // Locked, as a store build is until the flask's unlock, the debug-only card is not drawn at all.
    it('draws no debug-only card while debug mode is off', () => {
        mockDebugMode = false;
        render(<LabPage />);

        expect(screen.queryByRole('region', { name: 'mypage.lab.inApp' })).toBeNull();
    });
});

describe('LabPage — experiment switches', () => {
    beforeEach(() => jest.clearAllMocks());

    it.each([
        ['mypage.lab.placeInvite', setPlaceInvite],
        ['mypage.lab.chatInputLock', setChatInputLock],
    ])('ticks as %s flips, and turns it on', (label, setEnabled) => {
        render(<LabPage />);
        fireEvent.click(screen.getByRole('switch', { name: label }));

        expect(setEnabled).toHaveBeenCalledWith(true);
        expect(mockHaptic.mock.calls).toEqual([['selection']]);
    });
});
