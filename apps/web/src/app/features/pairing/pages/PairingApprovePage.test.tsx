import { fireEvent, render, screen } from '@testing-library/react';

import { PairingApprovePage } from './PairingApprovePage';

const navigate = jest.fn();
const toast = jest.fn();
let mockNative = true;
let mockPaired = false;
let mockEnabled = true;
let mockGuest = false;
let mockClouds: Array<{ id: string; name: string }> = [];
let mockInvited: Array<{ id: string; name: string }> = [];
let mockSelected = 'default';
const approval = {
    code: '',
    setCode: jest.fn(),
    state: { step: 'input' } as { step: string; check?: unknown },
    error: null as string | null,
    approve: jest.fn(),
    deny: jest.fn(),
    retry: jest.fn(),
    reset: jest.fn(),
};
const scanPairingQr = jest.fn();
const openSettings = jest.fn();
let mockLive = false;

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k) }),
}));
jest.mock('react-router-dom', () => ({ Navigate: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div> }));
jest.mock('@chatic/bridges', () => ({ isNative: () => mockNative }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@chatic/lib/utils', () => ({ cn: (...c: unknown[]) => c.filter(Boolean).join(' ') }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useIsPairedSession: () => mockPaired,
            useSessionSelection: () => ({ selectedCloudId: mockSelected }),
        },
    },
}));
jest.mock('../../../hooks', () => ({
    useDevicePairingEnabled: () => mockEnabled,
    useIsAccountGuest: () => mockGuest,
    useCloudSessionCatalog: () => ({ clouds: mockClouds }),
    useInvitedClouds: () => ({ invitedClouds: mockInvited }),
    useCloudName: () => (id?: string) => [...mockClouds, ...mockInvited].find(c => c.id === id)?.name || id || '',
}));
jest.mock('../../../ui/components', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
jest.mock('../hooks', () => ({
    useNow: () => 0,
    usePairingApproval: () => approval,
}));
jest.mock('../lib/scanPairingQr', () => ({ scanPairingQr: () => scanPairingQr() }));
jest.mock('../../../bridge', () => ({ appBridge: { openSettings: () => openSettings() } }));
jest.mock('../lib/liveQrScanner', () => ({ canScanLive: () => mockLive }));
// The sheet's own behaviour is tested beside it; here it only has to report back.
jest.mock('../components/QrScannerSheet', () => ({
    QrScannerSheet: (p: { onCode: (c: string) => void; onClose: () => void; onUnavailable: (r: string) => void }) => (
        <div data-testid="live-scanner">
            <button onClick={() => p.onCode('07344168')}>live-code</button>
            <button onClick={p.onClose}>live-close</button>
            <button onClick={() => p.onUnavailable('denied')}>live-denied</button>
            <button onClick={() => p.onUnavailable('failed')}>live-failed</button>
        </div>
    ),
}));

const CHECK = {
    pairingId: 'p-1',
    purpose: 'web',
    deviceId: 'd-1',
    client: { name: 'Chrome · macOS', platform: 'web' },
    expiredAt: 60_000,
};

beforeEach(() => {
    jest.clearAllMocks();
    mockNative = true;
    mockPaired = false;
    mockEnabled = true;
    mockGuest = false;
    mockClouds = [];
    mockInvited = [];
    mockSelected = 'default';
    mockLive = false;
    Object.assign(approval, { code: '', state: { step: 'input' }, error: null });
});

describe('PairingApprovePage', () => {
    it.each([
        ['in a browser', () => (mockNative = false)],
        ['on a secondary device', () => (mockPaired = true)],
        ['on a guest app — it has no sign-in of its own to hand on', () => (mockGuest = true)],
        ['with the flag off', () => (mockEnabled = false)],
    ])('is not available %s', (_label, arrange) => {
        arrange();
        render(<PairingApprovePage />);

        expect(screen.getByTestId('redirect').textContent).toBe('/mypage');
    });

    describe('with a camera stream', () => {
        beforeEach(() => (mockLive = true));

        it('scans live and fills the input with the code it reads', () => {
            render(<PairingApprovePage />);

            fireEvent.click(screen.getByTestId('pairing-approve-scan'));
            fireEvent.click(screen.getByText('live-code'));

            expect(approval.setCode).toHaveBeenCalledWith('07344168');
            expect(screen.queryByTestId('live-scanner')).toBeNull();
            expect(scanPairingQr).not.toHaveBeenCalled();
        });

        it('closes without a word or a photo when the person closes it', () => {
            render(<PairingApprovePage />);

            fireEvent.click(screen.getByTestId('pairing-approve-scan'));
            fireEvent.click(screen.getByText('live-close'));

            expect(screen.queryByTestId('live-scanner')).toBeNull();
            expect(scanPairingQr).not.toHaveBeenCalled();
            expect(screen.queryByText(/pairing.approve.scan(Denied|OldApp|NotOurs|NoQr)/)).toBeNull();
        });

        it('falls back to a photo when the camera stream cannot be opened', async () => {
            scanPairingQr.mockResolvedValue({ kind: 'code', code: '07344168' });
            render(<PairingApprovePage />);

            fireEvent.click(screen.getByTestId('pairing-approve-scan'));
            fireEvent.click(screen.getByText('live-failed'));
            await Promise.resolve();

            expect(scanPairingQr).toHaveBeenCalled();
            expect(approval.setCode).toHaveBeenCalledWith('07344168');
        });

        it('takes a refused camera as the answer: a note, no photo camera', () => {
            render(<PairingApprovePage />);

            fireEvent.click(screen.getByTestId('pairing-approve-scan'));
            fireEvent.click(screen.getByText('live-denied'));

            expect(screen.getByText('pairing.approve.scanDenied')).not.toBeNull();
            expect(scanPairingQr).not.toHaveBeenCalled();
        });

        it('offers Settings for a refused camera, the only place it can be allowed again', () => {
            render(<PairingApprovePage />);

            fireEvent.click(screen.getByTestId('pairing-approve-scan'));
            fireEvent.click(screen.getByText('live-denied'));
            expect(screen.getByText('pairing.approve.cameraRefused.title')).not.toBeNull();
            fireEvent.click(screen.getByRole('button', { name: 'pairing.approve.cameraRefused.settings' }));

            expect(openSettings).toHaveBeenCalledTimes(1);
            expect(screen.queryByText('pairing.approve.cameraRefused.title')).toBeNull();
            // The note outlives the prompt, for whoever closes it and types the digits instead.
            expect(screen.getByText('pairing.approve.scanDenied')).not.toBeNull();
        });

        it('does not offer Settings when the camera failed for another reason', async () => {
            scanPairingQr.mockResolvedValue({ kind: 'cancel' });
            render(<PairingApprovePage />);

            fireEvent.click(screen.getByTestId('pairing-approve-scan'));
            fireEvent.click(screen.getByText('live-failed'));
            await Promise.resolve();

            expect(screen.queryByText('pairing.approve.cameraRefused.title')).toBeNull();
        });
    });

    it('fills the input from a photographed QR where no camera stream exists', async () => {
        scanPairingQr.mockResolvedValue({ kind: 'code', code: '07344168' });
        render(<PairingApprovePage />);

        fireEvent.click(screen.getByTestId('pairing-approve-scan'));
        await screen.findByTestId('pairing-approve-scan');
        await Promise.resolve();

        expect(approval.setCode).toHaveBeenCalledWith('07344168');
    });

    it.each([
        ['oldApp', 'pairing.approve.scanOldApp'],
        ['notOurs', 'pairing.approve.scanNotOurs'],
        ['noQr', 'pairing.approve.scanNoQr'],
    ])('explains a %s scan', async (kind, message) => {
        scanPairingQr.mockResolvedValue({ kind });
        render(<PairingApprovePage />);

        fireEvent.click(screen.getByTestId('pairing-approve-scan'));

        expect(await screen.findByText(message)).not.toBeNull();
        expect(approval.setCode).not.toHaveBeenCalled();
    });

    it('says nothing when the camera was cancelled', async () => {
        scanPairingQr.mockResolvedValue({ kind: 'cancel' });
        render(<PairingApprovePage />);

        fireEvent.click(screen.getByTestId('pairing-approve-scan'));
        await Promise.resolve();

        expect(screen.queryByText(/pairing.approve.scan(OldApp|NotOurs|NoQr)/)).toBeNull();
    });

    it('shows the lookup error in words', () => {
        approval.error = 'expired';
        render(<PairingApprovePage />);

        expect(screen.getByTestId('pairing-approve-error').textContent).toBe('pairing.approve.errors.expired');
    });

    it('shows who asks and approves my whole account by default on the relay', () => {
        approval.state = { step: 'confirm', check: CHECK };
        mockClouds = [{ id: '1000002', name: 'Lemon' }];
        render(<PairingApprovePage />);

        expect(screen.getByTestId('pairing-approve-client').textContent).toBe('Chrome · macOS');
        expect((screen.getByTestId('pairing-target-relay') as HTMLInputElement).checked).toBe(true);
        fireEvent.click(screen.getByTestId('pairing-approve-submit'));
        expect(approval.approve).toHaveBeenCalledWith({ type: 'relay' });
    });

    it('names the cloud on the button once a cloud is chosen', () => {
        approval.state = { step: 'confirm', check: CHECK };
        mockClouds = [{ id: '1000002', name: 'Lemon' }];
        mockSelected = '1000002';
        render(<PairingApprovePage />);

        expect(screen.getByTestId('pairing-approve-submit').textContent).toBe(
            'pairing.scope.cloudApprove:{"cloud":"Lemon"}'
        );
    });

    it('offers an invited cloud and starts on it while the app is in it', () => {
        approval.state = { step: 'confirm', check: CHECK };
        mockClouds = [{ id: '1000002', name: 'Lemon' }];
        mockInvited = [{ id: '1000009', name: 'Lime' }];
        mockSelected = '1000009';
        render(<PairingApprovePage />);

        expect((screen.getByTestId('pairing-target-1000009') as HTMLInputElement).checked).toBe(true);
        fireEvent.click(screen.getByTestId('pairing-approve-submit'));
        expect(approval.approve).toHaveBeenCalledWith({ type: 'cloud', cloudId: '1000009' });
    });

    it('keeps approval off for a developer tool until it is confirmed', () => {
        approval.state = { step: 'confirm', check: { ...CHECK, purpose: 'debug' } };
        render(<PairingApprovePage />);

        const submit = screen.getByTestId('pairing-approve-submit') as HTMLButtonElement;
        expect(submit.disabled).toBe(true);
        fireEvent.click(screen.getByTestId('pairing-approve-debug-confirm'));
        expect(submit.disabled).toBe(false);
    });

    it('says the web will finish and closes after approving', () => {
        approval.state = { step: 'approved' };
        render(<PairingApprovePage />);

        expect(toast).toHaveBeenCalledWith({ title: 'pairing.approve.approved' });
        expect(navigate).toHaveBeenCalledWith(-1);
    });

    it('offers to look the same code up again after a network failure', () => {
        approval.error = 'unknown';
        render(<PairingApprovePage />);

        fireEvent.click(screen.getByTestId('pairing-approve-retry'));
        expect(approval.retry).toHaveBeenCalled();
    });
});
