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
                dm={<p>people</p>}
            />
        );

        expect(screen.getByText('inbox')).toBeTruthy();
        expect(screen.queryByRole('navigation', { name: 'Channels' })).toBeNull();
    });

    it('keeps the Home list mounted, out of sight, while another destination is open', () => {
        mounted.mockClear();
        unmounted.mockClear();
        const { rerender } = render(
            <NavSidebar
                active="home"
                home={<HomeList />}
                notifications={<p>inbox</p>}
                channels={<p>rooms</p>}
                dm={<p>people</p>}
            />
        );

        rerender(
            <NavSidebar
                active="notifications"
                home={<HomeList />}
                notifications={<p>inbox</p>}
                channels={<p>rooms</p>}
                dm={<p>people</p>}
            />
        );

        expect(unmounted).not.toHaveBeenCalled();
        expect(screen.getByText('home').closest('[hidden]')).toBeTruthy();

        rerender(
            <NavSidebar
                active="home"
                home={<HomeList />}
                notifications={<p>inbox</p>}
                channels={<p>rooms</p>}
                dm={<p>people</p>}
            />
        );

        expect(mounted).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('navigation', { name: 'Channels' })).toBeTruthy();
        expect(screen.queryByText('inbox')).toBeNull();
    });
});
