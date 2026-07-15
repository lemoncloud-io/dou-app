import { fireEvent, render, screen } from '@testing-library/react';

import { FloatingTabBar, type FloatingTabBarItem } from './FloatingTabBar';

const items: FloatingTabBarItem[] = [
    { key: 'chat', label: '채팅', icon: <span>c</span>, activeIcon: <span>C</span>, active: true },
    { key: 'my', label: 'MY', icon: <span>m</span> },
];

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
        // active tab swaps to the uppercase active glyph
        expect(chat).toHaveTextContent('C');
        expect(screen.getByRole('button', { name: 'MY' })).not.toHaveAttribute('aria-current');
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

    it('uses a supplied badgeLabel for the accessible name when provided', () => {
        render(
            <FloatingTabBar
                items={[{ key: 'chat', label: '채팅', icon: <span>c</span>, badge: 5, badgeLabel: '5개 안 읽음' }]}
                onSelect={jest.fn()}
            />
        );
        expect(screen.getByRole('button', { name: '5개 안 읽음' })).toBeInTheDocument();
    });
});
