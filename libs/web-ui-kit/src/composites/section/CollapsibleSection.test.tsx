import { fireEvent, render, screen } from '@testing-library/react';

import { CollapsibleSection } from './CollapsibleSection';

describe('CollapsibleSection', () => {
    it('renders the title and body open by default', () => {
        render(
            <CollapsibleSection title="Place">
                <div>row</div>
            </CollapsibleSection>
        );

        expect(screen.getByText('Place')).toBeInTheDocument();
        expect(screen.getByText('row')).toBeInTheDocument();
    });

    it('starts collapsed when defaultOpen is false', () => {
        render(
            <CollapsibleSection title="Place" defaultOpen={false}>
                <div>row</div>
            </CollapsibleSection>
        );

        expect(screen.queryByText('row')).not.toBeInTheDocument();
    });

    it('toggles the body when the chevron is clicked (uncontrolled)', () => {
        render(
            <CollapsibleSection title="Place" toggleLabel="toggle">
                <div>row</div>
            </CollapsibleSection>
        );

        const toggle = screen.getByRole('button', { name: 'toggle' });
        expect(toggle).toHaveAttribute('aria-expanded', 'true');

        fireEvent.click(toggle);
        expect(screen.queryByText('row')).not.toBeInTheDocument();
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    it('is controlled by the open prop and reports changes via onOpenChange', () => {
        const onOpenChange = jest.fn();
        render(
            <CollapsibleSection title="Place" open={false} onOpenChange={onOpenChange} toggleLabel="toggle">
                <div>row</div>
            </CollapsibleSection>
        );

        // Controlled: body stays hidden regardless of internal clicks.
        expect(screen.queryByText('row')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
        expect(onOpenChange).toHaveBeenCalledWith(true);
        expect(screen.queryByText('row')).not.toBeInTheDocument();
    });

    it('renders extra actions alongside the chevron', () => {
        render(
            <CollapsibleSection title="Chat" actions={<button>add</button>}>
                <div>row</div>
            </CollapsibleSection>
        );

        expect(screen.getByRole('button', { name: 'add' })).toBeInTheDocument();
    });
});
