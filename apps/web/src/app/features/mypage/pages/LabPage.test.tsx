import { act, fireEvent, render, screen } from '@testing-library/react';

import { LabPage } from './LabPage';

const openSubWebView = jest.fn();
const toast = jest.fn();
let mockPages: { name: string; url: string }[] = [];

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
jest.mock('../../../bridge', () => ({ openSubWebView: (...args: unknown[]) => openSubWebView(...args) }));
jest.mock('../../../hooks', () => ({
    useChatInputLockExperiment: () => ({ isEnabled: false, setEnabled: jest.fn() }),
    usePlaceInviteExperiment: () => ({ isEnabled: false, setEnabled: jest.fn() }),
    useSubWebViewLabPages: () => mockPages,
}));
jest.mock('../../../ui/components', () => ({ PageHeader: () => null }));
jest.mock('../../debug', () => ({
    DebugUnlockDialog: () => null,
    debugOverlayActions: { open: jest.fn() },
    useDebugMode: () => ({ isEnabled: false }),
    useDebugUnlock: () => ({
        isChallengeOpen: false,
        hasError: false,
        registerTap: jest.fn(),
        submitCode: jest.fn(),
        cancelChallenge: jest.fn(),
    }),
}));

const PAGES = [
    { name: 'sample', url: 'https://sample.apps-dev.chatic.io/' },
    { name: 'sample1', url: 'https://sample1.apps-dev.chatic.io/' },
];

describe('LabPage — sub WebView pages', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPages = PAGES;
        openSubWebView.mockResolvedValue({ via: 'subWebView', viewId: 'view-1' });
    });

    it('lists each page with its URL', () => {
        render(<LabPage />);

        expect(screen.getByRole('region', { name: 'mypage.lab.subWebViewPages' })).toBeTruthy();
        expect(screen.getByRole('button', { name: /^sample https:\/\/sample\.apps-dev/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /^sample1 https:\/\/sample1\.apps-dev/ })).toBeTruthy();
    });

    it('opens the page tapped in the sub WebView', async () => {
        render(<LabPage />);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /^sample1 / }));
        });

        expect(openSubWebView).toHaveBeenCalledWith({ url: 'https://sample1.apps-dev.chatic.io/' });
        expect(toast).not.toHaveBeenCalled();
    });

    it('says so when the app refuses to open it', async () => {
        openSubWebView.mockRejectedValue(Object.assign(new Error('nope'), { code: 'NOT_ALLOWED' }));
        render(<LabPage />);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /^sample / }));
        });

        expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'mypage.lab.subWebViewOpenFailed', variant: 'destructive' })
        );
    });

    // A store build gets none from the flag, and the section is not drawn at all.
    it('draws nothing when there are no pages', () => {
        mockPages = [];
        render(<LabPage />);

        expect(screen.queryByRole('region', { name: 'mypage.lab.subWebViewPages' })).toBeNull();
    });
});
