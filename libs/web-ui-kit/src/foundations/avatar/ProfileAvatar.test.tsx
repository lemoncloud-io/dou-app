import { fireEvent, render, screen } from '@testing-library/react';

import { ProfileAvatar } from './ProfileAvatar';

describe('ProfileAvatar', () => {
    it('renders the image when src is provided', () => {
        render(<ProfileAvatar src="http://example.com/turtle.png" alt="프로필 사진" onSelect={jest.fn()} />);

        expect(screen.getByRole('img', { name: '프로필 사진' })).toHaveAttribute(
            'src',
            'http://example.com/turtle.png'
        );
    });

    it('renders a placeholder glyph (no image) when src is absent', () => {
        render(<ProfileAvatar onSelect={jest.fn()} />);

        expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('fires onSelect and renders as a button when onSelect is provided', () => {
        const onSelect = jest.fn();
        render(<ProfileAvatar onSelect={onSelect} selectLabel="사진 선택" />);

        fireEvent.click(screen.getByRole('button', { name: '사진 선택' }));

        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('is not a button when onSelect is omitted', () => {
        render(<ProfileAvatar src="http://example.com/turtle.png" alt="프로필" />);

        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    // The empty state is Figma's "1명 Profile" (3177-13120): the hand-authored solid silhouette on a
    // brand-ink circle, rendered at the avatar's full size so its 42×42 viewBox lands
    // circle-relative. It is NOT the grey lucide outline this component used to draw.
    it('renders the solid single-person silhouette on a brand-ink circle by default', () => {
        const { container } = render(<ProfileAvatar size={86} />);

        const glyph = container.querySelector('svg');
        expect(glyph).toHaveAttribute('viewBox', '0 0 42 42');
        expect(glyph).toHaveAttribute('width', '86');
        expect(container.querySelector('.bg-brand-ink')).toBeInTheDocument();
        expect(container.querySelector('.lucide-user')).not.toBeInTheDocument();
    });

    // The group placeholder is the hand-authored IconGroup, inset rather than full-bleed.
    it('renders the group glyph inset on the same brand-ink circle when glyph="group"', () => {
        const { container } = render(<ProfileAvatar size={86} glyph="group" />);

        expect(container.querySelector('.bg-brand-ink')).toBeInTheDocument();
        expect(container.querySelector('svg')).toHaveAttribute('width', '48');
        expect(container.querySelector('.lucide-user')).not.toBeInTheDocument();
    });

    it('shows defaultImage instead of the user glyph, and never for the group glyph', () => {
        // Queried by selector, not by role: the default empty alt makes the image presentational.
        const { container, rerender } = render(<ProfileAvatar defaultImage="http://example.com/place.svg" />);
        expect(container.querySelector('img')).toHaveAttribute('src', 'http://example.com/place.svg');
        expect(container.querySelector('svg')).not.toBeInTheDocument();

        // glyph="group" wins over defaultImage.
        rerender(<ProfileAvatar glyph="group" defaultImage="http://example.com/place.svg" />);
        expect(container.querySelector('img')).not.toBeInTheDocument();
    });

    // Every placeholder this component can show is dark, so the badge is light-on-dark.
    it('renders the select badge light against the dark avatar', () => {
        const { container } = render(<ProfileAvatar onSelect={jest.fn()} />);

        expect(container.querySelector('.bg-muted')).toBeInTheDocument();
    });
});
