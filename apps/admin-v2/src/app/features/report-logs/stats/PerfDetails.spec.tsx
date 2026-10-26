/**
 * `stats/PerfDetails.spec.tsx`
 *
 * The performance-details view against a fake list endpoint: each section reads its own statistic,
 * an empty statistic shows its empty state rather than zeros, and the message-send split follows
 * the URL.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '../../../i18n';
import type * as ReportLogApi from '../api/reportLogApi';
import type { RawMockView, ReportLogListResponse } from '../api/reportLogApi';

const fetchReportLogs = vi.fn<(params?: Record<string, unknown>) => Promise<ReportLogListResponse>>();

vi.mock('../api/reportLogApi', async () => {
    const actual = await vi.importActual<typeof ReportLogApi>('../api/reportLogApi');
    return { ...actual, fetchReportLogs: (params?: Record<string, unknown>) => fetchReportLogs(params) };
});

const { useConsoleNav } = await import('../hooks/use-console-nav');
const { PerfDetails } = await import('./PerfDetails');

// 2026-10-26 14:30 KST.
const NOW = Date.parse('2026-10-26T14:30:00+09:00');
const MIN = 60_000;

let seq = 0;
const stat = (tag: string, fields: Record<string, unknown>): RawMockView => {
    const at = NOW - (10 + seq) * MIN;
    return {
        id: `r${++seq}`,
        createdAt: at,
        stereo: 'log',
        meta: { level: 'info', tag, message: tag, timestamp: at, uid: 'u1', runId: 'run-a', ...fields },
    };
};

const BY_TAG: Record<string, RawMockView[]> = {
    'perf.chat_room_open': [
        stat('perf.chat_room_open', {
            kind: 'trace',
            durationMs: 400,
            attrs: { outcome: 'shown', cache: 'hit', entry: 'list' },
        }),
        stat('perf.chat_room_open', {
            kind: 'trace',
            durationMs: 8000,
            attrs: { outcome: 'timeout', cache: 'miss', entry: 'list' },
        }),
    ],
    'perf.api_request': [
        stat('perf.api_request', {
            kind: 'sample',
            sr: 0.2,
            attrs: { endpoint: '/clouds/:id', method: 'GET', status_class: '5xx', outcome: 'error', backend: 'relay' },
            metrics: { rtt_ms: 1500 },
        }),
    ],
    'perf.chat_send': [
        stat('perf.chat_send', {
            kind: 'trace',
            sr: 0.2,
            durationMs: 300,
            attrs: { thread: 'root', kind: 'text', outcome: 'ok' },
        }),
        stat('perf.chat_send', {
            kind: 'trace',
            sr: 0.2,
            durationMs: 500,
            attrs: { thread: 'reply', kind: 'text', outcome: 'ok' },
        }),
    ],
    'perf.web_vitals': [
        stat('perf.web_vitals', { kind: 'sample', attrs: { vital: 'inp' }, metrics: { value_ms: 120 } }),
        stat('perf.web_vitals', { kind: 'sample', attrs: { vital: 'cls' }, metrics: { value_ms: 50 } }),
    ],
};

let location = '';
const LocationProbe = () => {
    location = useLocation().search;
    return null;
};

const View = () => <PerfDetails nav={useConsoleNav()} />;

const renderView = () =>
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter initialEntries={['/report-logs?tab=stats&view=detail']}>
                <View />
                <LocationProbe />
            </MemoryRouter>
        </QueryClientProvider>
    );

const sectionOf = (title: string) => screen.getByRole('heading', { name: title }).closest('section') as HTMLElement;

beforeEach(async () => {
    fetchReportLogs.mockReset();
    fetchReportLogs.mockImplementation(async (params = {}) => {
        const list = BY_TAG[String(params.tag)] ?? [];
        return { list, total: list.length };
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    await act(() => i18n.changeLanguage('ko'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('PerfDetails', () => {
    it('fetches each statistic by its tag', async () => {
        renderView();
        await waitFor(() => expect(screen.getByText('메시지가 보임')).toBeTruthy());
        const tags = fetchReportLogs.mock.calls.map(call => call[0]?.tag);
        expect(new Set(tags)).toEqual(
            new Set(['perf.chat_room_open', 'perf.api_request', 'perf.chat_send', 'perf.long_tasks', 'perf.web_vitals'])
        );
    });

    it('shows room outcomes, the endpoint table with estimated counts and highlights, and the vitals', async () => {
        renderView();
        await waitFor(() => expect(screen.getByText('메시지가 보임')).toBeTruthy());

        const room = sectionOf('채팅방 입장');
        expect(within(room).getByText('시간 초과')).toBeTruthy();
        expect(within(room).getByText('hit')).toBeTruthy();

        const api = sectionOf('서버 요청');
        const endpointRow = within(api).getByText('/clouds/:id').closest('tr') as HTMLElement;
        // One kept record at a 20% rate stands for five requests.
        expect(within(endpointRow).getByText('5')).toBeTruthy();
        // A single sampled request: its 100% is shown, but not highlighted as a failing endpoint.
        expect(within(endpointRow).getByText('100%').className).not.toContain('text-red-600');
        expect(within(endpointRow).getByText('중계 서버')).toBeTruthy();

        const vitals = sectionOf('그 밖의 웹 지표');
        expect(within(vitals).getByText('0.05')).toBeTruthy();
        expect(within(vitals).getByText('기준 안')).toBeTruthy();
    });

    it('shows an empty state for a statistic with no records', async () => {
        renderView();
        await waitFor(() => expect(screen.getByText('이 기간에 화면 멈춤 기록이 없어요')).toBeTruthy());
    });

    it('switches the message-send split and writes it to the URL', async () => {
        renderView();
        const send = await waitFor(() => {
            const section = sectionOf('메시지 보내기');
            expect(within(section).getByText('스레드 답글')).toBeTruthy();
            return section;
        });

        fireEvent.click(within(send).getByRole('button', { name: '메시지 종류' }));

        expect(new URLSearchParams(location).get('by')).toBe('kind');
        expect(within(send).getByText('글')).toBeTruthy();
        expect(within(send).queryByText('스레드 답글')).toBeNull();
    });
});
