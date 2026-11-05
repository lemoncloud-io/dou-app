import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { LabPage } from './LabPage';

const openSubWebView = jest.fn();
const toast = jest.fn();
let mockDebugMode = false;

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/config', () => ({ config: { get: () => 'code' } }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@chatic/web-ui-kit', () => ({
    IconChevronRight: () => null,
    Switch: () => null,
    MenuCard: ({ title, children }: { title?: string; children: React.ReactNode }) => (
        <section aria-label={title}>{children}</section>
    ),
    ListRow: ({ title, subtitle, onClick }: { title: string; subtitle?: string; onClick?: () => void }) => (
        <button type="button" onClick={onClick}>
            {title} {subtitle}
        </button>
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
    useChatInputLockExperiment: () => ({ isEnabled: false, setEnabled: jest.fn() }),
    usePlaceInviteExperiment: () => ({ isEnabled: false, setEnabled: jest.fn() }),
}));
jest.mock('../../../ui/components', () => ({ PageHeader: () => null }));
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
