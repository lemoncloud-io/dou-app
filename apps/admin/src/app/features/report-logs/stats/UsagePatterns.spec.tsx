/**
 * `stats/UsagePatterns.spec.tsx`
 *
 * The usage patterns view against a fake list endpoint: the server's counts and the usage events
 * read into the five sections, the single empty screen and its "widen the period" step, and a
 * backend without the aggregation.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '../../../i18n';
import type * as ReportLogApi from '../api/reportLogApi';
import type { RawMockView, ReportLogListResponse } from '../api/reportLogApi';
import { useConsoleNav } from '../hooks/use-console-nav';

const fetchReportLogs = vi.fn<(params?: Record<string, unknown>) => Promise<ReportLogListResponse>>();

vi.mock('../api/reportLogApi', async () => {
    const actual = await vi.importActual<typeof ReportLogApi>('../api/reportLogApi');
    return { ...actual, fetchReportLogs: (params?: Record<string, unknown>) => fetchReportLogs(params) };
});

const { UsagePatterns } = await import('./UsagePatterns');

// 2026-10-26 14:30 KST.
const NOW = Date.parse('2026-10-26T14:30:00+09:00');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const DAY_START = Date.parse('2026-10-20T00:00:00+09:00');

const usage = (tag: string, fields: Record<string, unknown>, at = NOW - HOUR): RawMockView => ({
    id: Math.random().toString(),
    createdAt: at,
    stereo: 'log',
    meta: { level: 'info', kind: 'event', tag, timestamp: at, uid: 'u1', runId: 'run-a', sr: 1, ...fields },
});

type Route = (params: Record<string, unknown>) => ReportLogListResponse | undefined;

const serve = (...routes: Route[]) =>
    fetchReportLogs.mockImplementation(async (params = {}) => {
        for (const route of routes) {
            const answer = route(params);
            if (answer) return answer;
        }
        return { list: [], total: 0 };
    });

const isStats = (p: Record<string, unknown>) => p.limit === 1;

/** A week of data: the server's counts and one page of each usage event. */
const week: Route[] = [
    p =>
        isStats(p) && !p.tag && p.interval === 'day'
            ? {
                  list: [],
                  total: 900,
                  stats: {
                      users: 42,
                      trend: [
                          { key: DAY_START, val: 100, users: 10 },
                          { key: DAY_START + 6 * DAY, val: 200, users: 30 },
                      ],
                  },
              }
            : undefined,
    p =>
        isStats(p) && p.tag === 'usage.session_start' && p.interval === 'day'
            ? { list: [], total: 120, stats: { users: 40, trend: [{ key: DAY_START, val: 120, users: 40 }] } }
            : undefined,
    p =>
        isStats(p) && p.tag === 'usage.session_start' && p.interval === 'hour'
            ? {
                  list: [],
                  total: 120,
                  stats: {
                      users: 40,
                      trend: [
                          { key: DAY_START + 9 * HOUR, val: 20 },
                          { key: DAY_START + 21 * HOUR, val: 30 },
                          { key: DAY_START + DAY + 21 * HOUR, val: 25 },
                      ],
                  },
              }
            : undefined,
    p =>
        !isStats(p) && p.tag === 'usage.session_end'
            ? {
                  list: [
                      usage('usage.session_end', { metrics: { duration_ms: 60_000, screens: 2 } }),
                      usage('usage.session_end', { metrics: { duration_ms: 180_000, screens: 4 } }),
                  ],
                  total: 2,
              }
            : undefined,
    p =>
        !isStats(p) && p.tag === 'usage.screen_view'
            ? {
                  list: [
                      usage('usage.screen_view', { attrs: { screen: '/home' } }),
                      usage('usage.screen_view', {
                          attrs: { screen: '/channels/:id/room', prev_screen: '/home' },
                          metrics: { prev_dwell_ms: 5_000 },
                      }),
                      usage('usage.screen_view', { attrs: { screen: '/home', prev_screen: '/channels/:id/room' } }),
                  ],
                  total: 3,
              }
            : undefined,
    p =>
        !isStats(p) && p.tag === 'usage.session_start'
            ? {
                  list: [
                      usage('usage.session_start', { attrs: { start: 'cold', entry: 'icon' } }),
                      usage('usage.session_start', { attrs: { start: 'resume', entry: 'push' } }),
                      usage('usage.session_start', { attrs: { start: 'cold', entry: 'icon' } }),
                  ],
                  total: 3,
              }
            : undefined,
];

let location = '';
const Harness = () => {
    const nav = useConsoleNav();
    location = useLocation().search;
    return <UsagePatterns nav={nav} />;
};

const renderView = (initial = '/report-logs?tab=stats&view=usage') =>
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter initialEntries={[initial]}>
                <Harness />
            </MemoryRouter>
        </QueryClientProvider>
    );

const section = (heading: string) => screen.getByRole('heading', { name: heading }).closest('section') as HTMLElement;

beforeEach(async () => {
    fetchReportLogs.mockReset();
    serve();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    await act(() => i18n.changeLanguage('ko'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('UsagePatterns', () => {
    it('reads the server counts and the usage events into each section', async () => {
        serve(...week);
        renderView();

        const glance = section('한눈에 보기');
        expect(await within(glance).findByText('42')).toBeTruthy();
        expect(within(glance).getByText('120')).toBeTruthy();
        // 120 opens by 40 people who opened it.
        expect(within(glance).getByText('3')).toBeTruthy();
        expect(within(glance).getByText('앱 사용 2번 기준')).toBeTruthy();
        expect(within(glance).getByText('3개')).toBeTruthy();

        expect(within(section('날짜별')).getByRole('img', { name: '사용한 사람' })).toBeTruthy();

        // 21:00 summed over two days beats 09:00.
        expect(within(section('하루 중 언제 쓰나요')).getByText('가장 많이 여는 시간: 21시 (55번)')).toBeTruthy();

        const screens = section('많이 보는 화면');
        expect(within(screens).getByText('/home')).toBeTruthy();
        expect(within(screens).getByText('/channels/:id/room')).toBeTruthy();
        expect(within(screens).getByText('화면 2종류 · 조회 3번')).toBeTruthy();

        const starts = section('어떻게 시작하나요');
        expect(within(starts).getByText('새로 시작')).toBeTruthy();
        expect(within(starts).getByText('30분 넘게 쉬었다 복귀')).toBeTruthy();
        expect(within(starts).getByText('푸시 알림')).toBeTruthy();
        expect(within(starts).getByText('앱 열기 3번 기준')).toBeTruthy();
    });

    it('asks the server per hour for a short period', async () => {
        serve(...week);
        renderView('/report-logs?tab=stats&view=usage&period=today');

        expect(await screen.findByRole('heading', { name: '시간별' })).toBeTruthy();
        const intervals = fetchReportLogs.mock.calls.map(call => call[0]?.interval).filter(Boolean);
        expect(new Set(intervals)).toEqual(new Set(['hour']));
    });

    it('shows one empty screen whose button widens the period', async () => {
        renderView('/report-logs?tab=stats&view=usage&period=today');

        expect(await screen.findByText('이 기간에는 사용 기록이 없어요')).toBeTruthy();
        expect(screen.queryByRole('heading', { name: '많이 보는 화면' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: '기간 넓히기' }));

        // Seven days is the statistics tab's default, so the parameter is dropped.
        expect(new URLSearchParams(location).get('period')).toBeNull();
    });

    it('says so when the server does not aggregate, instead of showing zeros', async () => {
        serve(p => (isStats(p) && !p.tag ? { list: [], total: 50 } : undefined), ...week.slice(3));
        renderView();

        expect(await screen.findAllByText('서버가 아직 사용량을 집계하지 않아요')).toHaveLength(3);
        const glance = section('한눈에 보기');
        expect(within(glance).getAllByText('—').length).toBeGreaterThan(0);
        expect(within(section('많이 보는 화면')).getByText('/home')).toBeTruthy();
    });
});
