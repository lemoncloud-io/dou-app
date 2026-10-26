import { render } from '@testing-library/react';

import { AvatarFrame } from './avatarBase';

const strokeOf = (root: Element) => root.querySelector('[data-avatar-stroke]') as HTMLElement | null;

describe('AvatarFrame', () => {
    it('keeps the stroke off the clipping box, so the content gets the full diameter', () => {
        const { container } = render(<AvatarFrame px={42} />);
        const root = container.firstElementChild as HTMLElement;

        expect(root.style.width).toBe('42px');
        expect(root.style.height).toBe('42px');
        expect(root.className).toContain('overflow-hidden');
        expect(root.className).not.toMatch(/\bborder\b/);
    });

    // A positioned avatar would paint over static siblings it overlaps (a stack's "+N" chip).
    it('stacks its layers in one grid cell instead of positioning them', () => {
        const { container } = render(<AvatarFrame px={20} />);
        const root = container.firstElementChild as HTMLElement;

        expect(root.className).toContain('inline-grid');
        expect(root.className).not.toMatch(/\b(relative|absolute)\b/);
        expect(strokeOf(root)?.className).not.toMatch(/\b(relative|absolute)\b/);
    });

    it('paints the stroke as the last layer, over the content, covering the whole circle', () => {
        const { container } = render(
            <AvatarFrame px={42}>
                <img alt="" src="http://example.com/a.png" />
            </AvatarFrame>
        );
        const root = container.firstElementChild as HTMLElement;
        const stroke = strokeOf(root);

        expect(root.lastElementChild).toBe(stroke);
        expect(stroke?.className).toContain('size-full');
        expect(stroke?.className).toContain('rounded-full');
        expect(stroke?.className).toContain('border-avatar-stroke');
        expect(stroke?.className).toContain('pointer-events-none');
        expect(stroke).toHaveAttribute('aria-hidden', 'true');
    });

    it('takes another stroke colour', () => {
        const { container } = render(<AvatarFrame px={36} stroke="border-avatar-ring" />);

        expect(strokeOf(container)?.className).toContain('border-avatar-ring');
        expect(strokeOf(container)?.className).not.toContain('border-avatar-stroke');
    });

    it('draws no stroke when it is null', () => {
        const { container } = render(<AvatarFrame px={36} stroke={null} />);

        expect(strokeOf(container)).toBeNull();
    });
});
