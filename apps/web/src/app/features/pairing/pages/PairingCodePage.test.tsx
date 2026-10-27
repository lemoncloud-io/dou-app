import { fireEvent, render, screen } from '@testing-library/react';

import type { runtime } from '@chatic/app-runtime';

type PairingRequestState = runtime.session.PairingRequestState;

import { PairingCodePage } from './PairingCodePage';

const navigate = jest.fn();
const toast = jest.fn();
const restart = jest.fn();
let mockState: PairingRequestState = { phase: 'requesting' };
let mockEnabled = true;
let mockGuest = true;
let mockLocationState: unknown = null;

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k) }),
}));
jest.mock('react-router-dom', () => ({
    useLocation: () => ({ state: mockLocationState }),
    Navigate: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div>,
}));
jest.mock('qrcode.react', () => ({
    QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="pairing-qr" data-value={value} />,
}));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
let mockNative = false;
jest.mock('@chatic/bridges', () => ({ isNative: () => mockNative }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@chatic/lib/utils', () => ({ cn: (...c: unknown[]) => c.filter(Boolean).join(' ') }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            usePairingRequest: () => ({ state: mockState, restart }),
            pairingClientOf: () => ({ name: 'Chrome · macOS', platform: 'web' }),
        },
    },
}));
jest.mock('../../../hooks', () => ({ useIsAccountGuest: () => mockGuest }));
let mockCanGoBack = false;
jest.mock('../../../navigation', () => ({ canGoBackInApp: () => mockCanGoBack }));
jest.mock('../../../ui/components', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
jest.mock('../hooks', () => ({ useDevicePairingEnabled: () => mockEnabled, useNow: () => 1_000_000 - 125_000 }));

beforeEach(() => {
    jest.clearAllMocks();
    mockState = { phase: 'requesting' };
    mockEnabled = true;
    mockGuest = true;
    mockLocationState = null;
    mockCanGoBack = false;
    mockNative = false;
});

describe('PairingCodePage', () => {
    it.each([
        ['the flag is off', false, true],
        ['the session is already an account', true, false],
    ])('sends the user back to My page when %s', (_label, enabled, guest) => {
        mockEnabled = enabled;
        mockGuest = guest;
        render(<PairingCodePage />);

        expect(screen.getByTestId('redirect').textContent).toBe('/mypage');
    });

    it('shows the code in two groups, its QR and the time left', () => {
        mockState = { phase: 'waiting', code: '07344168', expiredAt: 1_000_000, pairingId: 'p-1' };
        render(<PairingCodePage />);

        expect(screen.getByTestId('pairing-code').textContent).toBe('0734-4168');
        expect(screen.getByTestId('pairing-qr').getAttribute('data-value')).toBe('07344168');
        expect(screen.getByTestId('pairing-remaining').textContent).toContain('2:05');
        expect(screen.getByText(/pairing.code.checkBrowser:.*Chrome · macOS/)).not.toBeNull();
    });

    it.each([
        [{ phase: 'expired', code: '07344168' }, 'pairing.code.expired', 'pairing.code.newCode'],
        [{ phase: 'denied' }, 'pairing.code.denied', 'pairing.code.retry'],
        [{ phase: 'lost' }, 'pairing.code.lost', 'pairing.code.startOver'],
        [{ phase: 'failed', status: 403 }, 'pairing.code.failed', 'pairing.code.retry'],
    ] as const)('offers a fresh start when it ends %j', (state, message, action) => {
        mockState = state as PairingRequestState;
        render(<PairingCodePage />);

        expect(screen.getByText(message)).not.toBeNull();
        fireEvent.click(screen.getByText(action));
        expect(restart).toHaveBeenCalledTimes(1);
    });

    it('says which account it signed in with and goes back past the login screen', () => {
        mockState = { phase: 'done', target: { type: 'relay' }, approverName: 'developer' };
        mockLocationState = { returnTo: '/channels' };
        mockCanGoBack = true;
        render(<PairingCodePage />);

        expect(toast).toHaveBeenCalledWith({
            title: 'pairing.code.doneRelayTitle:{"name":"developer"}',
            description: 'pairing.code.doneRelayBody',
        });
        expect(navigate).toHaveBeenCalledWith(-2);
    });

    it('lands on home after a cloud approval opened from nowhere in the app', () => {
        mockState = { phase: 'done', target: { type: 'cloud', cloudId: '1000002' } };
        render(<PairingCodePage />);

        expect(toast).toHaveBeenCalledWith({ title: 'pairing.code.doneCloud' });
        expect(navigate).toHaveBeenCalledWith('/', { replace: true, transition: true, direction: 'back' });
    });

    it('tells a phone that it is now a secondary device of its approver', () => {
        mockNative = true;
        mockState = { phase: 'done', target: { type: 'relay' }, approverName: 'developer' };
        render(<PairingCodePage />);

        expect(toast).toHaveBeenCalledWith({
            title: 'pairing.code.doneRelayTitle:{"name":"developer"}',
            description: 'pairing.code.doneSecondaryBody',
        });
    });
});
