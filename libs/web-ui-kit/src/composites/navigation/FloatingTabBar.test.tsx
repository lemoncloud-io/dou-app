import { fireEvent, render, screen } from '@testing-library/react';

import { FloatingTabBar, type FloatingTabBarItem } from './FloatingTabBar';

const items: FloatingTabBarItem[] = [
    { key: 'chat', label: '채팅', icon: <span>c</span>, activeIcon: <span>C</span>, active: true },
    { key: 'my', label: 'MY', icon: <span>m</span> },
];

// Both glyphs of a tab stay mounted so they can cross-fade; the one not showing is faded out.
const isFaded = (glyph: HTMLElement) => glyph.parentElement?.classList.contains('opacity-0') ?? false;
const labelOf = (tab: HTMLElement) => tab.querySelector('[data-expanded]');

describe('FloatingTabBar', () => {
    it('renders every tab label and fires onSelect with the tapped key', () => {
        const onSelect = jest.fn();
        render(<FloatingTabBar items={items} onSelect={onSelect} />);
        fireEvent.click(screen.getByRole('button', { name: 'MY' }));
        expect(onSelect).toHaveBeenCalledWith('my');
    });

    it('marks the active tab with aria-current and uses its activeIcon', () => {
        render(<FloatingTabBar items={items} onSelect={jest.fn()} />);
        const chat = screen.getByRole('button', { name: '채팅' });
        expect(chat).toHaveAttribute('aria-current', 'page');
        // The active tab shows the uppercase active glyph and fades the line one out.
        expect(isFaded(screen.getByText('C'))).toBe(false);
        expect(isFaded(screen.getByText('c'))).toBe(true);
        expect(screen.getByRole('button', { name: 'MY' })).not.toHaveAttribute('aria-current');
    });

    it('shows the plain icon when no activeIcon is given, selected or not', () => {
        render(<FloatingTabBar items={[{ ...items[1], active: true }]} onSelect={jest.fn()} />);

        expect(isFaded(screen.getByText('m'))).toBe(false);
    });

    it('shows a badge only when count > 0 and clamps above badgeMax', () => {
        const { rerender } = render(
            <FloatingTabBar
                items={[{ key: 'chat', label: '채팅', icon: <span>c</span>, badge: 0 }]}
                onSelect={jest.fn()}
            />
        );
        expect(screen.queryByText(/\d/)).not.toBeInTheDocument();

        rerender(
            <FloatingTabBar
                items={[{ key: 'chat', label: '채팅', icon: <span>c</span>, badge: 1200 }]}
                onSelect={jest.fn()}
                badgeMax={999}
            />
        );
        expect(screen.getByText('+999')).toBeInTheDocument();
    });

    it('folds the badge into the accessible name so screen readers announce the count', () => {
        render(
            <FloatingTabBar
                items={[{ key: 'chat', label: '채팅', icon: <span>c</span>, badge: 5 }]}
                onSelect={jest.fn()}
            />
        );
        // The count is not lost behind the button's aria-label.
        expect(screen.getByRole('button', { name: '채팅, 5' })).toBeInTheDocument();
    });

    // An unselected tab shows no text, so a badge label alone ("5 unread") would leave a screen
    // reader no way to tell which tab it is on.
    it('puts the tab name before a supplied badgeLabel in the accessible name', () => {
        render(
            <FloatingTabBar
                items={[{ key: 'chat', label: '채팅', icon: <span>c</span>, badge: 5, badgeLabel: '5개 안 읽음' }]}
                onSelect={jest.fn()}
            />
        );
        expect(screen.getByRole('button', { name: '채팅, 5개 안 읽음' })).toBeInTheDocument();
    });

    // Figma 5780:17209: only the selected tab spells out its name; the rest are icons alone. Every
    // tab keeps its label mounted, folded shut, so it can unfold when the tab is picked — and the
    // name still reaches a screen reader on every tab through the button's own label.
    it('unfolds the label on the selected tab only, while every tab keeps it as its accessible name', () => {
        render(<FloatingTabBar items={items} onSelect={jest.fn()} />);

        const chat = screen.getByRole('button', { name: '채팅' });
        const my = screen.getByRole('button', { name: 'MY' });
        expect(labelOf(chat)).toHaveAttribute('data-expanded', 'true');
        expect(labelOf(chat)).toHaveClass('grid-cols-[1fr]');
        expect(labelOf(my)).toHaveAttribute('data-expanded', 'false');
        expect(labelOf(my)).toHaveClass('grid-cols-[0fr]', 'opacity-0');
    });

    // The animation is CSS transitions between these states, so a reduced-motion setting must be
    // able to switch every one of them off.
    it('lets reduced motion turn off every transition it runs', () => {
        render(<FloatingTabBar items={items} onSelect={jest.fn()} />);

        const chat = screen.getByRole('button', { name: '채팅' });
        const animated = [
            chat,
            labelOf(chat),
            screen.getByText('C').parentElement,
            screen.getByText('c').parentElement,
        ];
        animated.forEach(el => expect(el).toHaveClass('motion-reduce:transition-none'));
    });

    it('moves the label and the filled icon when the selection moves', () => {
        const { rerender } = render(<FloatingTabBar items={items} onSelect={jest.fn()} />);

        rerender(
            <FloatingTabBar
                items={[
                    { ...items[0], active: false },
                    { ...items[1], active: true },
                ]}
                onSelect={jest.fn()}
            />
        );

        expect(labelOf(screen.getByRole('button', { name: '채팅' }))).toHaveAttribute('data-expanded', 'false');
        expect(labelOf(screen.getByRole('button', { name: 'MY' }))).toHaveAttribute('data-expanded', 'true');
        // Back to the line glyph once it is no longer selected.
        expect(isFaded(screen.getByText('c'))).toBe(false);
        expect(isFaded(screen.getByText('C'))).toBe(true);
    });

    // The selected tab's icon sits left of its name, so the badge is anchored to the icon — a
    // button-centred badge would cover the text.
    it('hangs the badge off the icon on an unselected tab and off the capsule corner on the selected one', () => {
        const badged = (active: boolean): FloatingTabBarItem[] => [
            { key: 'chat', label: '채팅', icon: <span>c</span>, badge: 3, active },
            { key: 'my', label: 'MY', icon: <span>m</span>, active: !active },
        ];
        const { rerender } = render(<FloatingTabBar items={badged(false)} onSelect={jest.fn()} />);
        expect(screen.getByText('3')).toHaveAttribute('data-badge-at', 'icon');

        rerender(<FloatingTabBar items={badged(true)} onSelect={jest.fn()} />);
        const badge = screen.getByText('3');
        expect(badge).toHaveAttribute('data-badge-at', 'capsule');
        expect(badge).toHaveClass('right-0', 'top-0');
        // Still on its own tab, which is what the button's accessible name speaks for.
        expect(screen.getByRole('button', { name: '채팅, 3' })).toContainElement(badge);
    });

    it('draws a dot on the icon and folds dotLabel into the name when the tab has no count', () => {
        render(
            <FloatingTabBar
                items={[{ key: 'alerts', label: '알림', icon: <span>b</span>, dot: true, dotLabel: 'new' }]}
                onSelect={jest.fn()}
            />
        );

        const tab = screen.getByRole('button', { name: '알림, new' });
        expect(tab.querySelector('[data-dot]')).not.toBeNull();
    });

    it('prefers the count over the dot, and draws neither when both are off', () => {
        const { container, rerender } = render(
            <FloatingTabBar
                items={[{ key: 'alerts', label: '알림', icon: <span>b</span>, dot: true, badge: 2 }]}
                onSelect={jest.fn()}
            />
        );
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(container.querySelector('[data-dot]')).toBeNull();

        rerender(
            <FloatingTabBar items={[{ key: 'alerts', label: '알림', icon: <span>b</span> }]} onSelect={jest.fn()} />
        );
        expect(container.querySelector('[data-dot]')).toBeNull();
        expect(screen.getByRole('button', { name: '알림' })).toBeInTheDocument();
    });
});
