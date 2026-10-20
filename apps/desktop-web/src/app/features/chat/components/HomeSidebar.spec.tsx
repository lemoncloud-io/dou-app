import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';

import '../../../../i18n';

import { useSidebarSectionsStore } from '../stores';
import { SidebarHeader } from './SidebarHeader';
import { SortableSection } from './SortableSection';

// The Home sidebar is the header (title, search, Saved, the place's actions) above the sections
// `ChannelList` draws. ChannelList.spec covers which sections a place shows; this file covers
// the shape both pieces share with the design.

const renderHeader = (props: Partial<ComponentProps<typeof SidebarHeader>> = {}) =>
    render(
        <MemoryRouter>
            <SidebarHeader
                placeName="Lemon"
                isLoading={false}
                isDefaultMode={false}
                query=""
                onQueryChange={vi.fn()}
                onEditPlaceProfile={vi.fn()}
                onOpenSaved={vi.fn()}
                {...props}
            />
        </MemoryRouter>
    );

describe('Home sidebar header', () => {
    it('puts Saved first, ahead of the place actions', () => {
        renderHeader();
        const labels = screen.getAllByRole('button').map(button => button.textContent);
        expect(labels[0]).toBe(i18next.t('saved.title'));
    });

    // Mentions, threads and the snooze moved to the Notifications destination of the nav rail.
    it('holds no Mentions, Threads or snooze rows', () => {
        renderHeader();
        expect(screen.queryByRole('button', { name: /Mentions|Threads|Pause notifications/ })).toBeNull();
    });

    it('opens Saved from its entry', () => {
        const onOpenSaved = vi.fn();
        renderHeader({ onOpenSaved });
        fireEvent.click(screen.getByRole('button', { name: i18next.t('saved.title') }));
        expect(onOpenSaved).toHaveBeenCalledTimes(1);
    });
});

describe('Home sidebar section', () => {
    beforeEach(() => useSidebarSectionsStore.setState({ collapsed: {} }));

    const ROW = { key: 'ch:C1', node: <span>general</span>, keepWhenCollapsed: false };

    it('draws the fold chevron after the title, as the design does', () => {
        render(<SortableSection id="ch" title="Channels" items={[ROW]} />);
        const toggle = screen.getByRole('button', { name: 'Channels' });
        const heading = within(toggle).getByRole('heading', { name: 'Channels' });
        const chevron = toggle.querySelector('svg');
        expect(chevron).not.toBeNull();
        // The chevron follows the title in document order.
        expect(heading.compareDocumentPosition(chevron as SVGElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('says the section is empty instead of leaving a bare heading', () => {
        render(<SortableSection id="fav" title="Favorites" items={[]} emptyLabel="Favorites will appear here." />);
        expect(screen.getByText('Favorites will appear here.')).toBeTruthy();
    });

    it('drops the empty line once the section has rows', () => {
        render(<SortableSection id="ch" title="Channels" items={[ROW]} emptyLabel="No channels" />);
        expect(screen.queryByText('No channels')).toBeNull();
    });

    it('folds the empty line away with its section', () => {
        useSidebarSectionsStore.setState({ collapsed: { fav: true } });
        render(<SortableSection id="fav" title="Favorites" items={[]} emptyLabel="Favorites will appear here." />);
        expect(screen.queryByText('Favorites will appear here.')).toBeNull();
    });
});
