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

    // A place is a space, not a person, so its placeholder is the illustration rather than a glyph
    // (Figma 3408-27419). It paints its own circle, hence an <img> and no inline svg.
    it('renders the place illustration when glyph="place"', () => {
        // Queried by selector, not by role: the default empty alt makes the image presentational.
        const { container } = render(<ProfileAvatar glyph="place" />);

        expect(container.querySelector('img')).toBeInTheDocument();
        expect(container.querySelector('svg')).not.toBeInTheDocument();
    });

    // The DoU character is the only light placeholder: it carries no circle of its own, so the shell
    // switches to the light avatar-ring disc and the illustration is inset (58 of 86 in Figma).
    it('renders the DoU character inset on a light disc when glyph="home"', () => {
        const { container } = render(<ProfileAvatar size={86} glyph="home" />);

        const illustration = container.querySelector('img');
        expect(illustration).toBeInTheDocument();
        expect(illustration).toHaveStyle({ width: '58px', height: '58px' });
        expect(container.querySelector('.bg-avatar-ring')).toBeInTheDocument();
        expect(container.querySelector('.bg-brand-ink')).not.toBeInTheDocument();
    });

    it('scales the DoU character with the avatar size', () => {
        const { container } = render(<ProfileAvatar size={36} glyph="home" />);

        expect(container.querySelector('img')).toHaveStyle({ width: '24px', height: '24px' });
    });

    // A photo replaces the illustration, so the light-disc treatment must go with it.
    it('falls back to the dark shell when glyph="home" but a photo is set', () => {
        const { container } = render(<ProfileAvatar glyph="home" src="http://example.com/turtle.png" />);

        expect(container.querySelector('.bg-avatar-ring')).not.toBeInTheDocument();
        expect(container.querySelector('.bg-brand-ink')).toBeInTheDocument();
    });

    it('a real photo wins over every placeholder', () => {
        const { container } = render(<ProfileAvatar glyph="place" src="http://example.com/turtle.png" />);

        expect(container.querySelector('img')).toHaveAttribute('src', 'http://example.com/turtle.png');
    });

    // Every placeholder this component can show is dark, so the badge is light-on-dark.
    it('renders the select badge light against the dark avatar', () => {
        const { container } = render(<ProfileAvatar onSelect={jest.fn()} />);

        expect(container.querySelector('.bg-muted')).toBeInTheDocument();
    });

    // `bg-muted` (95% L) on `bg-avatar-ring` (96% L) is one lightness step — the badge would be
    // invisible. The light disc is the only case where the badge has to invert.
    it('flips the select badge dark on the light home disc', () => {
        const { container } = render(<ProfileAvatar glyph="home" onSelect={jest.fn()} />);

        expect(container.querySelector('.bg-brand-ink')).toBeInTheDocument();
        expect(container.querySelector('.bg-muted')).not.toBeInTheDocument();
    });
});
