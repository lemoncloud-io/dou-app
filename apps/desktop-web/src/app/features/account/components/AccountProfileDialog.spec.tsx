import { describe, expect, it, vi } from 'vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

const updateAccount = vi.fn();
vi.mock('../../../shared/hooks/useRelayAccount', () => ({
    useRelayAccount: () => ({ updateAccount }),
}));

import '../../../../i18n';
import { AccountProfileDialog } from './AccountProfileDialog';

describe('AccountProfileDialog seeding', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        updateAccount.mockResolvedValue(undefined);
    });
    afterEach(cleanup);

    // A session notify rebuilds the relay user object mid-edit: reseeding the
    // form off it wipes a half-typed name and photo.
    it('keeps a half-typed draft when the session notifies mid-edit', () => {
        const view = render(<AccountProfileDialog open onOpenChange={() => undefined} initial={{ name: 'Ada' }} />);

        const name = screen.getByLabelText('Display name') as HTMLInputElement;
        fireEvent.change(name, { target: { value: 'Ada II' } });

        view.rerender(<AccountProfileDialog open onOpenChange={() => undefined} initial={{ name: 'Ada III' }} />);

        expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Ada II');
    });

    it('seeds from the account when opened', () => {
        render(<AccountProfileDialog open onOpenChange={() => undefined} initial={{ name: 'Ada' }} />);

        expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Ada');
    });
});
