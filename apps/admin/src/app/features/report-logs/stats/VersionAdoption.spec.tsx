/**
 * `stats/VersionAdoption.spec.tsx`
 *
 * The version view against a fake list endpoint that aggregates: people per version with the
 * statistics coverage and the newest version, the day-by-day table, switching the split to OS,
 * and the states for an empty period and a backend that does not aggregate.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '../../../i18n';
import type * as ReportLogApi from '../api/reportLogApi';
import type { ReportLogListResponse } from '../api/reportLogApi';
import { useConsoleNav } from '../hooks/use-console-nav';

const fetchReportLogs = vi.fn<(params?: Record<string, unknown>) => Promise<ReportLogListResponse>>();

vi.mock('../api/reportLogApi', async () => {
    const actual = await vi.importActual<typeof ReportLogApi>('../api/reportLogApi');
    return { ...actual, fetchReportLogs: (params?: Record<string, unknown>) => fetchReportLogs(params) };
});

const { VersionAdoption } = await import('./VersionAdoption');

// 2026-10-26 14:30 KST.
const NOW = Date.parse('2026-10-26T14:30:00+09:00');
const DAY_25 = Date.parse('2026-10-25T00:00:00+09:00');
const DAY_26 = Date.parse('2026-10-26T00:00:00+09:00');

/** Users per version per day: 0.30.0 arrives on the 26th, 0.29.1 cannot send statistics. */
const VERSIONS: Record<string, Array<[number, number]>> = {
    '0.29.2': [
        [DAY_25, 6],
        [DAY_26, 2],
    ],
    '0.29.1': [
        [DAY_25, 2],
        [DAY_26, 2],
    ],
    '0.30.0': [[DAY_26, 6]],
};

const usersOf = (version: string) => VERSIONS[version].reduce((acc, [, n]) => acc + n, 0);

/** An aggregating backend: answers each request by its parameters. */
const aggregating = (params: Record<string, unknown> = {}): ReportLogListResponse => {
    const groupBy = params.groupBy as string[] | undefined;
    if (groupBy?.[0] === 'appVersion') {
        return {
            list: [],
            total: 900,
            stats: {
                groups: {
                    appVersion: [
                        { key: '0.29.2', val: 500 },
                        { key: '0.29.1', val: 300 },
                        { key: '0.30.0', val: 100 },
                    ],
                },
            },
        };
    }
    if (groupBy?.[0] === 'os') {
        return {
            list: [],
            total: 1000,
            stats: {
                groups: {
                    os: [
                        { key: 'ios', val: 600 },
                        { key: 'android', val: 400 },
                    ],
                },
            },
        };
    }
    if (typeof params.appVersion === 'string') {
        const trend = VERSIONS[params.appVersion].map(([key, users]) => ({ key, val: users * 10, users }));
        return { list: [], total: 1, stats: { users: usersOf(params.appVersion), trend } };
    }
    if (typeof params.os === 'string') {
        return { list: [], total: 1, stats: { users: params.os === 'ios' ? 12 : 9, trend: [] } };
    }
    return { list: [], total: 1000, stats: { users: 25, trend: [] } };
};

let location = '';
const LocationProbe = () => {
    location = useLocation().search;
    return null;
};

const View = () => <VersionAdoption nav={useConsoleNav()} />;

const renderView = (initial = '/report-logs?tab=stats&view=versions') =>
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter initialEntries={[initial]}>
                <View />
                <LocationProbe />
            </MemoryRouter>
        </QueryClientProvider>
    );

beforeEach(async () => {
    fetchReportLogs.mockReset();
    fetchReportLogs.mockImplementation(async params => aggregating(params));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    await act(() => i18n.changeLanguage('ko'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('VersionAdoption', () => {
    it('shows users per app version, the statistics coverage and the newest version', async () => {
        renderView();

        const bars = await screen.findByRole('list', { name: '앱 버전별 사용자 수' });
        const rows = within(bars).getAllByRole('listitem');
        // Sorted by users: 0.29.2 (8), 0.30.0 (6), 0.29.1 (4); shares are of all 25 users.
        expect(rows.map(row => row.textContent)).toEqual([
            expect.stringContaining('0.29.2'),
            expect.stringContaining('0.30.0'),
            expect.stringContaining('0.29.1'),
        ]);
        expect(rows[0].textContent).toContain('8명 · 32%');
        expect(rows[0].textContent).toContain('기록 500건');
        expect(within(rows[0]).getByText('통계 보냄')).toBeTruthy();
        expect(within(rows[2]).queryByText('통계 보냄')).toBeNull();

        // 14 of the 18 per-version users are on 0.29.2 or later.
        await waitFor(() => expect(screen.getByText('78%')).toBeTruthy());
        expect(screen.getByText('앱 사용자 18명 중 14명')).toBeTruthy();
        expect(screen.getByText('0.30.0', { selector: 'span.text-3xl' })).toBeTruthy();
        expect(screen.getByText(/10월 26일.*에 처음 보였어요/)).toBeTruthy();

        // Every value is asked for distinct users, with the daily split, over the period's days.
        expect(fetchReportLogs).toHaveBeenCalledWith(
            expect.objectContaining({ appVersion: '0.30.0', interval: 'day', users: true, from: '2026-10-20' })
        );
    });

    it('lays out the top versions day by day', async () => {
        renderView();

        const table = await screen.findByRole('table');
        const [head, ...body] = within(table).getAllByRole('row');
        expect(head.textContent).toContain('0.29.2');
        expect(head.textContent).toContain('0.30.0');
        expect(body).toHaveLength(2);
        // The 25th: 6 of 8 app users on 0.29.2, nobody on 0.30.0 yet.
        expect(body[0].textContent).toContain('75% · 6명');
        expect(body[0].textContent).toContain('0% · 0명');
        // The 26th: 0.30.0 has 6 of 10.
        expect(body[1].textContent).toContain('60% · 6명');
    });

    it('splits by OS when chosen, and drops the day-by-day table', async () => {
        renderView();
        await screen.findByRole('table');

        fireEvent.click(screen.getByRole('button', { name: 'OS' }));

        const bars = await screen.findByRole('list', { name: 'OS별 사용자 수' });
        expect(within(bars).getAllByRole('listitem')[0].textContent).toContain('ios');
        expect(new URLSearchParams(location).get('dim')).toBe('os');
        expect(screen.queryByRole('table')).toBeNull();
        expect(fetchReportLogs).toHaveBeenCalledWith(expect.objectContaining({ os: 'android', users: true }));
    });

    it('says the period is empty, never zeros', async () => {
        fetchReportLogs.mockImplementation(async () => ({ list: [], total: 0, stats: { users: 0, trend: [] } }));
        renderView();

        expect(await screen.findByText('이 기간에 기록이 없어요')).toBeTruthy();
        expect(screen.queryByText('0%')).toBeNull();
    });

    it('says when the server does not aggregate', async () => {
        fetchReportLogs.mockImplementation(async () => ({ list: [], total: 1000 }));
        renderView();

        expect(await screen.findByText('서버가 아직 이 집계를 하지 않아요')).toBeTruthy();
    });

    it('notes whole days when the window is narrower than them', async () => {
        renderView('/report-logs?tab=stats&view=versions&period=24h');

        expect(await screen.findByText(/서버는 날짜 단위로만 세서/)).toBeTruthy();
    });
});
