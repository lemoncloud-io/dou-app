import { fireEvent, render, screen } from '@testing-library/react';

import { PairingLogoutDialog } from './PairingLogoutDialog';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k) }),
}));
jest.mock('../../../hooks', () => ({
    useCloudName: () => (id?: string) =>
        (({ '1000002': 'Lemon', '1000009': 'Lime' }) as Record<string, string>)[id ?? ''] ?? id ?? '',
}));
jest.mock('../../channels/components/ConfirmDialog', () => ({
    ConfirmDialog: (p: {
        open: boolean;
        title: string;
        description?: string;
        confirmLabel: string;
        onConfirm: () => void;
    }) =>
        p.open ? (
            <div>
                <h2>{p.title}</h2>
                <pre data-testid="body">{p.description}</pre>
                <button type="button" onClick={p.onConfirm}>
                    {p.confirmLabel}
                </button>
            </div>
        ) : null,
}));

const logout = (pending: unknown[] | null) => ({
    start: jest.fn(),
    pending: pending as never,
    confirm: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn(),
    busy: false,
});

describe('PairingLogoutDialog', () => {
    it('lists each approval with its scope and warns about open cloud screens', () => {
        const value = logout([
            { pairingId: 'a', client: { name: 'Chrome' }, target: { type: 'relay' }, status: 'approved' },
            { pairingId: 'b', client: {}, target: { type: 'cloud', cloudId: '1000002' }, status: 'approved' },
        ]);
        render(<PairingLogoutDialog logout={value} action="logout" />);

        expect(screen.getByText('pairing.logout.title:{"count":2}')).not.toBeNull();
        expect(screen.getByTestId('body').textContent).toBe(
            [
                'Chrome · pairing.scope.relayLabel',
                'pairing.approve.unknownClient · pairing.scope.cloudLabel:{"cloud":"Lemon"}',
                'pairing.logout.cloudNote',
            ].join('\n')
        );
        fireEvent.click(screen.getByText('pairing.logout.confirm'));
        expect(value.confirm).toHaveBeenCalled();
    });

    it('names an approval into an invited cloud by its name', () => {
        render(
            <PairingLogoutDialog
                logout={logout([
                    {
                        pairingId: 'i',
                        client: { name: 'Safari' },
                        target: { type: 'cloud', cloudId: '1000009' },
                        status: 'approved',
                    },
                ])}
                action="logout"
            />
        );

        expect(screen.getByTestId('body').textContent).toContain('Safari · pairing.scope.cloudLabel:{"cloud":"Lime"}');
    });

    it('words it as withdrawing, without the cloud caveat for relay approvals only', () => {
        render(
            <PairingLogoutDialog
                logout={logout([
                    { pairingId: 'a', client: { name: 'Chrome' }, target: { type: 'relay' }, status: 'approved' },
                ])}
                action="withdraw"
            />
        );

        expect(screen.getByText('pairing.logout.withdrawTitle:{"count":1}')).not.toBeNull();
        expect(screen.getByTestId('body').textContent).toBe('Chrome · pairing.scope.relayLabel');
        expect(screen.getByText('pairing.logout.withdrawConfirm')).not.toBeNull();
    });

    it('is closed while nothing is pending', () => {
        render(<PairingLogoutDialog logout={logout(null)} action="logout" />);

        expect(screen.queryByTestId('body')).toBeNull();
    });
});
