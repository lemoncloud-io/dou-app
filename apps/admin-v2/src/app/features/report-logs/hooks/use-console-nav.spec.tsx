/**
 * `hooks/report-logs/use-console-nav.spec.tsx`
 *
 * Driven through a real router, reading the query string back — the URL is the store, so the part
 * worth proving is that a link restores the same tab, server and period.
 */
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { resolveTab, useConsoleNav, type ConsoleNav } from './use-console-nav';

let api: ConsoleNav;

const Probe = () => {
    api = useConsoleNav();
    const { search } = useLocation();
    return <span data-testid="search">{search}</span>;
};

const setup = (initial = '/report-logs') => {
    render(
        <MemoryRouter initialEntries={[initial]}>
            <Probe />
        </MemoryRouter>
    );
    return () => new URLSearchParams(screen.getByTestId('search').textContent ?? '');
};

describe('resolveTab', () => {
    it('opens the user tab by default and for a bare uid link', () => {
        expect(resolveTab(new URLSearchParams(''))).toBe('user');
        expect(resolveTab(new URLSearchParams('uid=u1'))).toBe('user');
    });

    it('opens the full-log tab for a link written before the tabs existed', () => {
        expect(resolveTab(new URLSearchParams('uid=u1&mode=timeline&runId=r1'))).toBe('all');
        expect(resolveTab(new URLSearchParams('from=2026-10-01&to=2026-10-02'))).toBe('all');
        expect(resolveTab(new URLSearchParams('tag=CHAT'))).toBe('all');
    });

    it('honours an explicit tab and ignores an unknown one', () => {
        expect(resolveTab(new URLSearchParams('tab=errors&mode=list'))).toBe('errors');
        expect(resolveTab(new URLSearchParams('tab=nope'))).toBe('user');
    });
});

describe('useConsoleNav', () => {
    it('defaults each tab to its own period and to the production server', () => {
        setup('/report-logs?tab=errors');
        expect(api.stage).toBe('v1');
        expect(api.period.preset).toBe('24h');
    });

    it('keeps only the server when switching tabs', () => {
        const search = setup('/report-logs?tab=user&uid=u1&period=1h&stage=d1');
        act(() => api.go('errors'));
        expect(search().toString()).toBe('tab=errors&stage=d1');
    });

    it('writes a period, dropping the default and any around instant', () => {
        const search = setup('/report-logs?tab=user&at=1700000000000');
        expect(api.period.preset).toBe('around');
        act(() => api.setPeriod('custom', { from: '2026-10-01', to: '2026-10-03' }));
        expect(search().get('at')).toBeNull();
        expect(search().get('period')).toBe('custom');
        expect(api.period).toMatchObject({ fromDate: '2026-10-01', toDate: '2026-10-03' });
        act(() => api.setPeriod('7d'));
        expect(search().get('period')).toBeNull();
        expect(search().get('from')).toBeNull();
    });

    it('leaves the production server out of the URL', () => {
        const search = setup('/report-logs?stage=d1');
        act(() => api.setStage('v1'));
        expect(search().get('stage')).toBeNull();
    });

    it('pins the resolved tab into a link that had none, so later edits cannot move it', () => {
        const search = setup('/report-logs');
        expect(search().get('tab')).toBe('user');

        act(() => api.setPeriod('custom', { from: '2026-10-01', to: '2026-10-03' }));

        expect(api.tab).toBe('user');
        expect(search().get('tab')).toBe('user');
    });

    it('keeps an old full-log link on the full-log tab after its parameters change', () => {
        const search = setup('/report-logs?uid=u1&kind=issue');
        expect(search().get('tab')).toBe('all');

        act(() => api.patch({ kind: '' }));

        expect(api.tab).toBe('all');
    });
});
