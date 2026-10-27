import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PairingLogoutDialog } from './PairingLogoutDialog';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k) }),
}));
vi.mock('../../../shared', () => ({ useCloudSessionCatalog: () => ({ clouds: [{ id: '1000002', name: 'Lemon' }] }) }));
vi.mock('../../channels/components/ConfirmDialog', () => ({
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
    start: vi.fn(),
    pending: pending as never,
    confirm: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
    busy: false,
});

describe('PairingLogoutDialog', () => {
    it('lists each approval with its scope, warns about open cloud screens, and confirms', () => {
        const value = logout([
            { pairingId: 'a', client: { name: 'Chrome' }, target: { type: 'relay' }, status: 'approved' },
            { pairingId: 'b', client: {}, target: { type: 'cloud', cloudId: '1000002' }, status: 'approved' },
        ]);
        render(<PairingLogoutDialog logout={value} />);

        expect(screen.getByText('pairing.logout.title:{"count":2}')).toBeTruthy();
        expect(screen.getByTestId('body').textContent).toBe(
            [
                'Chrome · pairing.approve.target.relay',
                'pairing.approve.unknownClient · pairing.approve.target.cloud:{"cloud":"Lemon"}',
                'pairing.logout.cloudNote',
            ].join('\n')
        );
        fireEvent.click(screen.getByText('pairing.logout.confirm'));
        expect(value.confirm).toHaveBeenCalled();
    });

    it('renders nothing while no sign-out is waiting', () => {
        const { container } = render(<PairingLogoutDialog logout={logout(null)} />);

        expect(container.innerHTML).toBe('');
    });
});
