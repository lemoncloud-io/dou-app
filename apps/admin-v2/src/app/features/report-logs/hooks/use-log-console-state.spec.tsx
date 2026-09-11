/**
 * `hooks/report-logs/use-log-console-state.spec.tsx`
 *
 * The URL is this hook's store, so the tests drive it through a real router and read the
 * resulting query string — asserting on internal state would not prove the part that
 * matters (that a shared link restores the view).
 */
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { todayLocalDate, useLogConsoleState, type LogConsoleState } from './use-log-console-state';

let api: LogConsoleState;

const Probe = () => {
    api = useLogConsoleState();
    const { search } = useLocation();
    return <span data-testid="search">{search}</span>;
};

const setup = (initial = '/report-logs') => {
    render(
        <MemoryRouter initialEntries={[initial]}>
            <Probe />
        </MemoryRouter>
    );
    return () => screen.getByTestId('search').textContent ?? '';
};

const params = (search: string) => new URLSearchParams(search);

describe('useLogConsoleState — 기본값', () => {
    it('defaults the range to today so the first walk is bounded', () => {
        setup();

        expect(api.server.from).toBe(todayLocalDate());
        expect(api.server.to).toBe('');
    });

    it('defaults to prod stage, all kinds and the list view', () => {
        setup();

        expect(api.server.stage).toBe('v1');
        expect(api.server.kind).toBe('all');
        expect(api.mode).toBe('list');
    });

    it('falls back to defaults for values that are not in the allowed set', () => {
        // A hand-edited or stale link must not put junk into the wire params.
        setup('/report-logs?stage=nope&kind=nope&mode=nope');

        expect(api.server.stage).toBe('v1');
        expect(api.server.kind).toBe('all');
        expect(api.mode).toBe('list');
    });
});

describe('useLogConsoleState — URL 왕복', () => {
    it('reads server axes out of the query string', () => {
        setup('/report-logs?stage=d1&kind=log-entry&from=2026-09-01&to=2026-09-02&level=error&uid=u1&cid=c1&runId=r1');

        expect(api.server).toEqual({
            stage: 'd1',
            kind: 'log-entry',
            from: '2026-09-01',
            to: '2026-09-02',
            level: 'error',
            uid: 'u1',
            cid: 'c1',
            runId: 'r1',
        });
    });

    it('reads client axes out of the query string', () => {
        setup('/report-logs?q=boom&tag=auth&appVersion=1.4.0');

        expect(api.client.query).toBe('boom');
        expect(api.client.facets).toEqual({ tag: 'auth', appVersion: '1.4.0' });
    });

    it('writes a server axis change back to the URL', () => {
        const search = setup();

        act(() => api.setServerAxis({ level: 'error' }));

        expect(params(search()).get('level')).toBe('error');
    });

    it('drops a key instead of writing an empty value', () => {
        const search = setup('/report-logs?level=error');

        act(() => api.setServerAxis({ level: '' }));

        expect(params(search()).has('level')).toBe(false);
    });

    it('keeps unrelated params when patching one', () => {
        const search = setup('/report-logs?uid=u1&q=boom');

        act(() => api.setFacet('tag', 'auth'));

        const next = params(search());
        expect(next.get('uid')).toBe('u1');
        expect(next.get('q')).toBe('boom');
        expect(next.get('tag')).toBe('auth');
    });
});

describe('useLogConsoleState — 추적 핀', () => {
    it('lists set pins in a fixed order', () => {
        setup('/report-logs?runId=r1&uid=u1');

        expect(api.pins).toEqual([
            { key: 'uid', value: 'u1' },
            { key: 'runId', value: 'r1' },
        ]);
    });

    it('has no pins when none are set', () => {
        setup();

        expect(api.pins).toEqual([]);
    });

    it('pinning a uid narrows without changing the view', () => {
        const search = setup();

        act(() => api.pin('uid', 'u1'));

        expect(params(search()).get('uid')).toBe('u1');
        expect(params(search()).has('mode')).toBe(false);
    });

    it('pinning a runId also opens the timeline', () => {
        const search = setup();

        act(() => api.pin('runId', 'r1'));

        const next = params(search());
        expect(next.get('runId')).toBe('r1');
        expect(next.get('mode')).toBe('timeline');
    });

    it('unpinning a runId leaves the timeline rather than drawing nothing', () => {
        const search = setup('/report-logs?runId=r1&mode=timeline');

        act(() => api.unpin('runId'));

        const next = params(search());
        expect(next.has('runId')).toBe(false);
        expect(next.get('mode')).toBe('list');
    });

    it('unpinning a uid keeps the current view', () => {
        const search = setup('/report-logs?uid=u1&mode=group');

        act(() => api.unpin('uid'));

        const next = params(search());
        expect(next.has('uid')).toBe(false);
        expect(next.get('mode')).toBe('group');
    });
});

describe('useLogConsoleState — 클라이언트 축 초기화', () => {
    it('clears the query and every facet but keeps the corpus axes and pins', () => {
        const search = setup('/report-logs?uid=u1&level=error&q=boom&tag=auth&appVersion=1.4.0');

        act(() => api.clearClientAxes());

        const next = params(search());
        expect(next.has('q')).toBe(false);
        expect(next.has('tag')).toBe(false);
        expect(next.has('appVersion')).toBe(false);
        // Untouched: clearing the narrowing must not throw away 5,000 collected rows.
        expect(next.get('uid')).toBe('u1');
        expect(next.get('level')).toBe('error');
    });
});
