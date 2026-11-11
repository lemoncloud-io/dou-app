/**
 * `stats/PerfCompare.spec.tsx`
 *
 * The performance comparison view against a fake list endpoint: a goal split by app version with
 * the newest version marked, the empty state, switching the goal and the split through the URL,
 * and the hop from a slow case to that user's timeline.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const { PerfCompare } = await import('./PerfCompare');

// 2026-10-26 14:30 KST.
const NOW = Date.parse('2026-10-26T14:30:00+09:00');
const MIN = 60_000;

let seq = 0;
const stat = (meta: Record<string, unknown>, at = NOW - 10 * MIN): RawMockView => {
    seq += 1;
    return {
        id: `s${seq}`,
        createdAt: at,
        stereo: 'log',
        meta: { level: 'info', timestamp: at, uid: 'u1', runId: `run-${seq}`, ...meta },
    };
};

const boot = (durationMs: number, appVersion: string, uid = 'u1', at?: number) =>
    stat({ tag: 'perf.boot', kind: 'trace', durationMs, appVersion, uid, model: 'iPhone16', os: 'ios' }, at);

type Route = (params: Record<string, unknown>) => ReportLogListResponse | undefined;

const serve = (...routes: Route[]) =>
    fetchReportLogs.mockImplementation(async (params = {}) => {
        for (const route of routes) {
            const answer = route(params);
            if (answer) return answer;
        }
        return { list: [], total: 0 };
    });

let location = '';
const View = () => {
    const nav = useConsoleNav();
    location = useLocation().search;
    return <PerfCompare nav={nav} />;
};

const renderView = (initial = '/report-logs?tab=stats&view=perf') =>
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter initialEntries={[initial]}>
                <View />
            </MemoryRouter>
        </QueryClientProvider>
    );

const params = () => new URLSearchParams(location);

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

describe('PerfCompare', () => {
    it('splits app start by app version, marks the newest and leads a slow case to its user', async () => {
        const list = [
            ...[900, 1_000, 1_100, 1_200, 1_300].map(ms => boot(ms, '0.29.2')),
            ...[1_000, 1_100, 1_200, 1_300, 1_400, 2_600].map(ms => boot(ms, '0.30.1')),
            boot(9_000, '0.30.10', '1000123', NOW - 20 * MIN),
        ];
        serve(p => (p.tag === 'perf.boot' ? { list, total: list.length } : undefined));
        renderView();

        const table = (await screen.findByText('앱 버전별 비교')).closest('section') as HTMLElement;
        const rows = within(table).getAllByRole('row').slice(1);
        expect(rows.map(row => (row as HTMLTableRowElement).cells[0].textContent)).toEqual([
            '앱 0.30.1',
            '앱 0.29.2',
            '앱 0.30.10최신 버전',
        ]);
        expect(within(rows[0]).getByText('목표 넘음')).toBeTruthy();
        expect(within(rows[1]).getByText('목표 안')).toBeTruthy();
        expect(within(rows[2]).getByText('측정이 적어 판단하기 일러요')).toBeTruthy();
        expect(screen.getByText('12')).toBeTruthy();

        const slowest = screen.getByText('가장 느린 10건').closest('section') as HTMLElement;
        const first = within(slowest).getAllByRole('row')[1];
        expect(within(first).getByText('사용자 1000123')).toBeTruthy();
        fireEvent.click(within(first).getByRole('button', { name: '그때 기록 보기' }));
        expect(params().get('tab')).toBe('user');
        expect(params().get('uid')).toBe('1000123');
        expect(params().get('at')).toBe(String(NOW - 20 * MIN));
    });

    it('says when the goal has no records and offers nothing wider at the widest period', async () => {
        renderView();

        expect(await screen.findByText('이 기간에 앱 시작 기록이 없어요')).toBeTruthy();
        expect(screen.queryByRole('button', { name: '기간 넓히기' })).toBeNull();
    });

    it('switches the goal and the split through the URL and reads only the matching vital', async () => {
        serve(p =>
            p.tag === 'perf.web_vitals'
                ? {
                      list: [
                          stat({
                              tag: 'perf.web_vitals',
                              kind: 'sample',
                              attrs: { vital: 'lcp' },
                              metrics: { value_ms: 2_000 },
                              platform: 'web',
                          }),
                          stat({
                              tag: 'perf.web_vitals',
                              kind: 'sample',
                              attrs: { vital: 'fcp' },
                              metrics: { value_ms: 900 },
                              platform: 'web',
                          }),
                      ],
                      total: 2,
                  }
                : undefined
        );
        renderView();
        await screen.findByText('이 기간에 앱 시작 기록이 없어요');

        fireEvent.click(screen.getByRole('button', { name: '주요 내용 표시 (LCP)' }));
        fireEvent.click(screen.getByRole('button', { name: '플랫폼' }));

        expect(params().get('goal')).toBe('lcp');
        expect(params().get('by')).toBe('platform');
        const table = (await screen.findByText('플랫폼별 비교')).closest('section') as HTMLElement;
        await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2));
        expect(within(table).getByText('웹')).toBeTruthy();
        expect(fetchReportLogs.mock.calls.some(call => call[0]?.tag === 'perf.web_vitals')).toBe(true);
    });
});
