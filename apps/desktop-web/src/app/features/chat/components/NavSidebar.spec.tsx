import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '@testing-library/react';

import { NavSidebar } from './NavSidebar';

const mounted = vi.fn();
const unmounted = vi.fn();

const HomeList = () => {
    useEffect(() => {
        mounted();
        return unmounted;
    }, []);
    return <nav aria-label="Channels">home</nav>;
};

describe('NavSidebar', () => {
    it('shows the open destination', () => {
        render(
            <NavSidebar
                active="notifications"
                home={<HomeList />}
                notifications={<p>inbox</p>}
                channels={<p>rooms</p>}
            />
        );

        expect(screen.getByText('inbox')).toBeTruthy();
        expect(screen.queryByRole('navigation', { name: 'Channels' })).toBeNull();
    });

    // The Home list writes the order the next-unread shortcut walks, and holds ⌘K and message search:
    // leaving Home must not unmount it, or all three stop where the reader left.
    it('keeps the Home list mounted, out of sight, while another destination is open', () => {
        mounted.mockClear();
        unmounted.mockClear();
        const { rerender } = render(
            <NavSidebar active="home" home={<HomeList />} notifications={<p>inbox</p>} channels={<p>rooms</p>} />
        );

        rerender(
            <NavSidebar
                active="notifications"
                home={<HomeList />}
                notifications={<p>inbox</p>}
                channels={<p>rooms</p>}
            />
        );

        expect(unmounted).not.toHaveBeenCalled();
        expect(screen.getByText('home').closest('[hidden]')).toBeTruthy();

        rerender(<NavSidebar active="home" home={<HomeList />} notifications={<p>inbox</p>} channels={<p>rooms</p>} />);

        expect(mounted).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('navigation', { name: 'Channels' })).toBeTruthy();
        expect(screen.queryByText('inbox')).toBeNull();
    });
});
