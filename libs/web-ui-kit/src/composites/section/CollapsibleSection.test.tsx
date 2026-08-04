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
        expect(toggle).toHaveAttribute('aria-expanded', 'false');

        // The body stays mounted through the collapse animation and unmounts when the
        // grid-row height transition ends.
        const body = screen.getByText('row').closest('.grid') as HTMLElement;
        fireEvent.transitionEnd(body, { propertyName: 'grid-template-rows' });
        expect(screen.queryByText('row')).not.toBeInTheDocument();
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

    it('renders no description or footer node when neither is supplied', () => {
        const { container } = render(
            <CollapsibleSection title="Place">
                <div>row</div>
            </CollapsibleSection>
        );

        // Guards the existing home Place/Chat markup: consumers that never pass the new props get
        // exactly two children — the header and the animated body wrapper.
        const section = container.querySelector('section') as HTMLElement;
        expect(section.children).toHaveLength(2);
    });

    it('places description and footer OUTSIDE the collapsing wrapper', () => {
        render(
            <CollapsibleSection
                title="내 클라우드"
                description="나만의 공간에서 그룹 대화 시작"
                footer={<button>add cloud</button>}
            >
                <div>row</div>
            </CollapsibleSection>
        );

        // The `.grid` wrapper is what animates to 0fr and clips its content, so containment — not
        // mere presence — is the real guarantee. jsdom applies no CSS, so asserting "still in the
        // document" after a collapse would pass even if these nodes were moved inside the clip.
        const clipped = screen.getByText('row').closest('.grid') as HTMLElement;
        expect(clipped).not.toBeNull();
        expect(clipped.contains(screen.getByText('나만의 공간에서 그룹 대화 시작'))).toBe(false);
        expect(clipped.contains(screen.getByRole('button', { name: 'add cloud' }))).toBe(false);
    });

    it('keeps description and footer mounted while the body is collapsed', () => {
        render(
            <CollapsibleSection
                title="내 클라우드"
                description="나만의 공간에서 그룹 대화 시작"
                footer={<button>add cloud</button>}
                toggleLabel="toggle"
            >
                <div>row</div>
            </CollapsibleSection>
        );

        // Collapse and let the height transition finish so the body unmounts.
        const body = screen.getByText('row').closest('.grid') as HTMLElement;
        fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
        fireEvent.transitionEnd(body, { propertyName: 'grid-template-rows' });

        // Only `children` unmounts — the header caption and the footer survive.
        expect(screen.queryByText('row')).not.toBeInTheDocument();
        expect(screen.getByText('나만의 공간에서 그룹 대화 시작')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'add cloud' })).toBeInTheDocument();
    });
});
