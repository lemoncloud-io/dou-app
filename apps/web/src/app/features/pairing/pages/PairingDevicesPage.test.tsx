import { fireEvent, render, screen } from '@testing-library/react';

import { PairingDevicesPage } from './PairingDevicesPage';

const navigate = jest.fn();
let mockNative = true;
let mockPaired = false;
let mockEnabled = true;
let mockGuest = false;
let mockSelected = 'default';
let devicesQuery: Record<string, unknown> = {};
let pairingsQuery: Record<string, unknown> = {};
const unlink = { mutateAsync: jest.fn().mockResolvedValue(undefined), isPending: false };
const revoke = { mutateAsync: jest.fn().mockResolvedValue(undefined), isPending: false };
const useApprovedPairings = jest.fn((_enabled: boolean) => pairingsQuery);

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k),
        i18n: { language: 'en' },
    }),
}));
jest.mock('react-router-dom', () => ({ Navigate: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div> }));
jest.mock('@chatic/bridges', () => ({ isNative: () => mockNative }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/web-ui-kit', () => ({
    MenuCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useIsPairedSession: () => mockPaired,
            useSessionSelection: () => ({ selectedCloudId: mockSelected }),
            deviceDisplayName: (d: { name?: string; platform?: string }) => (d.platform === 'ios' ? 'iPhone' : d.name),
        },
    },
}));
jest.mock('../../../hooks', () => ({
    useIsAccountGuest: () => mockGuest,
    useCloudSessionCatalog: () => ({ clouds: [{ id: '1000002', name: 'Lemon' }] }),
}));
jest.mock('../../../ui/components', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
jest.mock('../../channels/components/ConfirmDialog', () => ({
    ConfirmDialog: ({
        open,
        description,
        onConfirm,
    }: {
        open: boolean;
        description?: string;
        onConfirm: () => void;
    }) =>
        open ? (
            <div data-testid="confirm">
                <p data-testid="confirm-body">{description}</p>
                <button type="button" onClick={onConfirm}>
                    confirm
                </button>
            </div>
        ) : null,
}));
jest.mock('../hooks', () => ({
    useDevicePairingEnabled: () => mockEnabled,
    useMyDevices: () => devicesQuery,
    useUnlinkDevice: () => unlink,
    useApprovedPairings: (enabled: boolean) => useApprovedPairings(enabled),
    useRevokePairing: () => revoke,
}));

const DEVICES = {
    list: [
        { id: 'me', name: 'iPhone', kind: 'mobile', presence: 'green', current: true },
        { id: 'old', kind: '', presence: 'red', lastActiveAt: 0, current: false },
    ],
    at: 0,
};

beforeEach(() => {
    jest.clearAllMocks();
    mockNative = true;
    mockPaired = false;
    mockEnabled = true;
    mockGuest = false;
    mockSelected = 'default';
    devicesQuery = { data: DEVICES };
    pairingsQuery = { data: { list: [] } };
});

describe('PairingDevicesPage', () => {
    it('is not for a browser guest', () => {
        mockGuest = true;
        mockNative = false;
        render(<PairingDevicesPage />);

        expect(screen.getByTestId('redirect').textContent).toBe('/mypage');
    });

    it('names a phone by its system rather than the user agent the server stored for it', () => {
        devicesQuery = {
            data: {
                list: [
                    {
                        id: 'p',
                        name: 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36',
                        platform: 'ios',
                        kind: 'mobile',
                        presence: 'green',
                        current: false,
                    },
                ],
                at: 0,
            },
        };
        render(<PairingDevicesPage />);

        expect(screen.getByTestId('device-row-p').textContent).toContain('iPhone');
        expect(screen.getByTestId('device-row-p').textContent).not.toContain('Mozilla');
    });

    it('lists my devices, with no removal on this device and a label for an unknown kind', () => {
        render(<PairingDevicesPage />);

        expect(screen.queryByTestId('device-unlink-me')).toBeNull();
        expect(screen.getByTestId('device-row-old').textContent).toContain('pairing.devices.kind.unknown');
        expect(screen.getByText('pairing.devices.header')).not.toBeNull();
    });

    it('removes another device after confirming, and says how to end a web sign-in on a cloud', async () => {
        mockSelected = '1000002';
        render(<PairingDevicesPage />);

        expect(screen.getByText('pairing.devices.cloudHeader')).not.toBeNull();
        fireEvent.click(screen.getByTestId('device-unlink-old'));
        expect(screen.getByTestId('confirm-body').textContent).toBe(
            'pairing.devices.unlinkBody pairing.devices.unlinkCloudNote'
        );
        fireEvent.click(screen.getByText('confirm'));

        expect(unlink.mutateAsync).toHaveBeenCalledWith('old');
    });

    it('offers a retry when the list fails', () => {
        const refetch = jest.fn();
        devicesQuery = { isError: true, refetch };
        render(<PairingDevicesPage />);

        fireEvent.click(screen.getByText('pairing.code.retry'));
        expect(refetch).toHaveBeenCalled();
    });

    it('shows the approvals with their scope, flags an unclaimed relay one, and revokes with the right warning', () => {
        pairingsQuery = {
            data: {
                list: [
                    {
                        pairingId: 'r',
                        purpose: 'web',
                        client: { name: 'Chrome' },
                        target: { type: 'relay' },
                        status: 'approved',
                        approvedAt: 2,
                    },
                    {
                        pairingId: 'c',
                        purpose: 'web',
                        client: { name: 'Safari' },
                        target: { type: 'cloud', cloudId: '1000002' },
                        status: 'approved',
                        approvedAt: 1,
                    },
                ],
            },
        };
        render(<PairingDevicesPage />);

        expect(screen.getByTestId('pairing-row-r').textContent).toContain('pairing.devices.unclaimed');
        expect(screen.getByTestId('pairing-row-c').textContent).toContain('pairing.scope.cloudLabel:{"cloud":"Lemon"}');
        expect(screen.getByTestId('pairing-row-c').textContent).not.toContain('pairing.devices.unclaimed');

        fireEvent.click(screen.getByTestId('pairing-revoke-c'));
        expect(screen.getByTestId('confirm-body').textContent).toBe('pairing.devices.revokeCloudBody');
        fireEvent.click(screen.getByText('confirm'));
        expect(revoke.mutateAsync).toHaveBeenCalledWith('c');
    });

    it.each([
        ['in a browser', () => (mockNative = false)],
        ['on a secondary device', () => (mockPaired = true)],
        ['on a guest app', () => (mockGuest = true)],
    ])('does not show or ask for approvals %s', (_label, arrange) => {
        arrange();
        render(<PairingDevicesPage />);

        expect(screen.queryByTestId('pairing-approvals')).toBeNull();
        expect(useApprovedPairings).toHaveBeenCalledWith(false);
    });
});
