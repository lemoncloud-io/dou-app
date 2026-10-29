import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import '../../../../i18n';
import { ConfirmDialog } from './ConfirmDialog';

const renderDialog = (fullDescription?: boolean) =>
    render(
        <ConfirmDialog
            open
            onOpenChange={vi.fn()}
            title="Unlink?"
            description="What happens next."
            confirmLabel="Unlink"
            onConfirm={vi.fn()}
            fullDescription={fullDescription}
        />
    );

describe('ConfirmDialog', () => {
    afterEach(cleanup);

    // The description usually quotes user content, which is there to identify the thing, not reproduce it.
    it('clamps the description by default', () => {
        renderDialog();

        expect(screen.getByText('What happens next.').className).toContain('line-clamp-3');
    });

    it('shows the app’s own explanation whole when asked to', () => {
        renderDialog(true);

        expect(screen.getByText('What happens next.').className).not.toContain('line-clamp-3');
    });
});
