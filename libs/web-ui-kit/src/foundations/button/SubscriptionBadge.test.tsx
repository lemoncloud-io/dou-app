import { render, screen } from '@testing-library/react';

import { SubscriptionBadge, SubscriptionBadgeSkeleton } from './SubscriptionBadge';
import { SubscriptionButton } from './SubscriptionButton';

describe('SubscriptionBadge', () => {
    it('renders PRO with the accent border', () => {
        render(<SubscriptionBadge tier="pro" />);

        expect(screen.getByText('PRO').className).toContain('border-main-accent');
    });

    it('renders FREE without the accent', () => {
        render(<SubscriptionBadge tier="free" />);

        expect(screen.getByText('FREE').className).toContain('border-input-border');
    });

    it('supports a custom label', () => {
        render(<SubscriptionBadge tier="pro" label="구독중" />);

        expect(screen.getByText('구독중')).toBeTruthy();
    });

    // The whole reason this component exists: it goes inside other buttons, where a nested
    // <button> would be invalid HTML and would carve a dead zone out of the parent's tap target.
    it('is not a button', () => {
        render(<SubscriptionBadge tier="pro" />);

        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.getByText('PRO').tagName).toBe('SPAN');
    });

    // The in-menu pill (Figma 2870:20411 / 4135:24750) is 28px tall — tighter than the header
    // control — and the two tiers differ by a hair, so both trims are asserted.
    describe('size="xs" (in-menu pill)', () => {
        it('tightens PRO to a 2px gap on an opaque ground', () => {
            render(<SubscriptionBadge tier="pro" size="xs" />);
            const className = screen.getByText('PRO').className;

            expect(className).toContain('py-1.5');
            expect(className).toContain('gap-0.5');
            expect(className).toContain('bg-background');
            // The header control's roomier padding must be gone, not merely overridden visually.
            expect(className).not.toContain('py-2.5');
        });

        it('keeps FREE at a 4px gap with the extra pixel on the right', () => {
            render(<SubscriptionBadge tier="free" size="xs" />);
            const className = screen.getByText('FREE').className;

            expect(className).toContain('gap-1');
            expect(className).toContain('pl-2');
            expect(className).toContain('pr-[9px]');
            expect(className).not.toContain('bg-background');
        });
    });

    // The tier glyphs are the design's own (Solar bold), not the lucide stand-ins — a 16px square
    // frame is the tell.
    it('draws the tier glyph on the Figma 16px frame', () => {
        const { container } = render(<SubscriptionBadge tier="free" size="xs" />);

        expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 16 16');
    });

    // Guards the reason both derive from `buttonSurfaceClass` — a class string copied into one of
    // them would drift the moment the button system changed.
    it('carries the same surface classes as the button it twins', () => {
        const { unmount } = render(<SubscriptionBadge tier="pro" />);
        const badgeClass = screen.getByText('PRO').className;
        unmount();

        render(<SubscriptionButton tier="pro" />);
        const buttonClass = screen.getByRole('button', { name: /PRO/ }).className;

        // The badge adds `shrink-0` for its in-button role; everything else must match.
        const surfaceOf = (className: string) =>
            className
                .split(/\s+/)
                .filter(token => token && token !== 'shrink-0')
                .sort()
                .join(' ');
        expect(surfaceOf(badgeClass)).toBe(surfaceOf(buttonClass));
    });
});

describe('SubscriptionBadgeSkeleton', () => {
    // The footprint is borrowed, not declared: every class that sizes the FREE pill must be on the
    // skeleton too, or the real pill changes size when it replaces it.
    const sizingTokens = (className: string) =>
        className.split(/\s+/).filter(token => /^(p[xylr]?|gap|text|leading|tracking|h|w)-/.test(token));

    it.each(['sm', 'xs'] as const)('takes every sizing class of the %s FREE badge', size => {
        const { container } = render(
            <>
                <SubscriptionBadge tier="free" size={size} />
                <SubscriptionBadgeSkeleton size={size} />
            </>
        );
        const [badge, skeleton] = Array.from(container.children) as HTMLElement[];

        expect(sizingTokens(skeleton.className)).toEqual(expect.arrayContaining(sizingTokens(badge.className)));
        expect(skeleton.className).toContain('animate-pulse');
    });

    it('hides its borrowed FREE ink and stays out of the accessibility tree', () => {
        const { container } = render(<SubscriptionBadgeSkeleton />);
        const skeleton = container.firstElementChild as HTMLElement;

        expect(skeleton).toHaveAttribute('aria-hidden', 'true');
        expect((skeleton.firstElementChild as HTMLElement).className).toContain('invisible');
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
