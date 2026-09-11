/**
 * `pages/report-logs/ReportLogsPage.spec.tsx`
 *
 * Drives the assembled console against a fake list endpoint. The unit tests cover the
 * pieces; what only shows up here is the wiring the screen is actually about — that a
 * server axis restarts the corpus walk while a client axis does not, that pinning issues
 * a filtered query, and that new arrivals wait for a click.
 *
 * The screen sits behind an admin OAuth gate, so this stands in for clicking through it.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ReportLogApi from '../api/reportLogApi';
import type { RawMockView, ReportLogListResponse } from '../api/reportLogApi';
import { CORPUS_PAGE_SIZE } from '../lib/corpusPaging';
import { CORPUS_STALE_MS } from '../hooks/use-log-corpus';

const fetchReportLogs = vi.fn<(params?: Record<string, unknown>) => Promise<ReportLogListResponse>>();

// Mocked at the module edge: the real one reaches through `runtime.boot.webTransport`
// into a signed AWS request, which is not what this test is about.
vi.mock('../api/reportLogApi', async () => {
    const actual = await vi.importActual<typeof ReportLogApi>('../api/reportLogApi');
    return { ...actual, fetchReportLogs: (params?: Record<string, unknown>) => fetchReportLogs(params) };
});

const { ReportLogsPage } = await import('./ReportLogsPage');

/** A batch log entry as the endpoint returns it: everything inside `meta`. */
const entry = (over: Partial<Record<string, unknown>> = {}, id = Math.random().toString()): RawMockView => ({
    id,
    createdAt: 1_700_000_000_000,
    stereo: 'log',
    meta: {
        level: 'error',
        tag: 'auth',
        message: '로그인 실패',
        timestamp: 1_700_000_000_000,
        uid: 'u1',
        runId: 'run-a',
        appVersion: '1.4.0',
        ...over,
    },
});

/** Serve `rows` as one short page, so the walk finishes after a single request. */
const servePage = (rows: RawMockView[]) => {
    fetchReportLogs.mockResolvedValue({ list: rows, total: rows.length });
};

/**
 * A client per test, so one test's corpus is never served to the next. Retries off — a
 * failing fetch should surface as a failure here, not be retried behind the assertion.
 */
const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: CORPUS_STALE_MS } } });

const renderPage = (initial = '/report-logs', client: QueryClient = makeClient()) => {
    const result = render(
        <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={[initial]}>
                <ReportLogsPage />
            </MemoryRouter>
        </QueryClientProvider>
    );
    return { ...result, client };
};

/** Query params of the most recent list call. */
const lastParams = () => fetchReportLogs.mock.calls.at(-1)?.[0] ?? {};

beforeEach(() => {
    fetchReportLogs.mockReset();
    vi.useRealTimers();
});

describe('ReportLogsPage — 수집', () => {
    it('collects the range and reports the count', async () => {
        servePage([entry(), entry({ message: '두 번째' })]);

        renderPage();

        expect(await screen.findByText('2건 전수 수집 완료')).toBeTruthy();
        expect(screen.getByText('로그인 실패')).toBeTruthy();
    });

    it('defaults the range to today rather than walking the whole store', async () => {
        servePage([entry()]);

        renderPage();

        await screen.findByText('1건 전수 수집 완료');
        // A bounded first request is what keeps the initial paint off the 7.7k-record store.
        expect(lastParams().from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('walks every page until the set is exhausted', async () => {
        // A full page then a short one — the walk must not stop at the first. A "full" page
        // is whatever the corpus asks for, so the fixture reads the constant rather than
        // hardcoding it; the page size is a tuning decision and this test is not about it.
        const full = CORPUS_PAGE_SIZE;
        const total = full + 50;
        const page = (prefix: string, count: number) =>
            Array.from({ length: count }, (_, i) => entry({ message: `${prefix}-${i}` }, `${prefix}${i}`));
        fetchReportLogs.mockImplementation(async params => {
            const index = Number(params?.page ?? 0);
            return index === 0 ? { list: page('p0', full), total } : { list: page('p1', 50), total };
        });

        renderPage();

        expect(await screen.findByText(`${total.toLocaleString()}건 전수 수집 완료`)).toBeTruthy();
    });

    it('counts a record once when deep paging hands it back twice', async () => {
        // The `from`/`size` window shifts under a `createdAt` sort when records share a
        // timestamp, so page 1 can repeat a row from page 0.
        const last = CORPUS_PAGE_SIZE - 1;
        const page0 = Array.from({ length: CORPUS_PAGE_SIZE }, (_, i) => entry({ message: `row-${i}` }, `dup${i}`));
        fetchReportLogs.mockImplementation(async params => {
            const page = Number(params?.page ?? 0);
            return page === 0
                ? { list: page0, total: CORPUS_PAGE_SIZE + 1 }
                : {
                      list: [page0[last], entry({ message: 'genuinely new' }, 'fresh')],
                      total: CORPUS_PAGE_SIZE + 1,
                  };
        });

        renderPage();

        await screen.findByText('genuinely new');
        expect(screen.getAllByText(`row-${last}`)).toHaveLength(1);
    });

    // The request count is a design property of this screen, not an implementation detail:
    // a walk used to cost 50 round trips and every axis change paid it again. These lock in
    // the two things that fixed it.
    it('costs one request when the server already narrowed the range to a page', async () => {
        servePage([entry(), entry({ message: '두 번째' })]);

        renderPage();

        await screen.findByText('2건 전수 수집 완료');
        expect(fetchReportLogs).toHaveBeenCalledOnce();
    });

    it('spends exactly two requests to reach the ceiling, not one per render', async () => {
        // The walk is driven from an effect now, which is the one place it could stack
        // requests: a render caused by the first page landing must not launch another
        // fetch for a page already in flight.
        const full = Array.from({ length: CORPUS_PAGE_SIZE }, (_, i) => entry({ message: `p${i}` }, `p${i}`));
        fetchReportLogs.mockImplementation(async params => {
            const index = Number(params?.page ?? 0);
            return {
                list: full.map((row, i) => ({ ...row, id: `page${index}-${i}` })),
                total: 100_000,
            };
        });

        renderPage();

        await screen.findByText(/상한 1,000건까지만 수집/);
        expect(fetchReportLogs.mock.calls.length).toBe(2);
        expect(fetchReportLogs.mock.calls.map(c => c[0]?.page)).toEqual([0, 1]);
    });

    it('spends nothing on axis changes that are immediately superseded', async () => {
        servePage([entry()]);
        renderPage();
        await screen.findByText('1건 전수 수집 완료');
        const before = fetchReportLogs.mock.calls.length;

        // A date being typed fires a change per keystroke. Each one used to launch a full
        // walk whose result the next one discarded.
        fireEvent.change(screen.getByLabelText('종료일 (KST)'), { target: { value: '2026-09-0' } });
        fireEvent.change(screen.getByLabelText('종료일 (KST)'), { target: { value: '2026-09-01' } });
        fireEvent.change(screen.getByLabelText('종료일 (KST)'), { target: { value: '2026-09-02' } });

        await waitFor(() => expect(lastParams().to).toBe('2026-09-02'));
        // One walk for the value that stuck, not three.
        expect(fetchReportLogs.mock.calls.length).toBe(before + 1);
    });

    it('serves a revisited set of axes from the cache without fetching again', async () => {
        // Tracking is a loop of narrow, look, widen again; re-walking a range whose answer
        // has not changed is the cost react-query's keyed cache removes.
        servePage([entry()]);
        const { unmount, client } = renderPage();
        await screen.findByText('1건 전수 수집 완료');
        const spent = fetchReportLogs.mock.calls.length;
        unmount();

        renderPage('/report-logs', client);

        expect(await screen.findByText('로그인 실패')).toBeTruthy();
        expect(fetchReportLogs.mock.calls.length).toBe(spent);
    });

    it('shows a stale corpus immediately and refreshes it behind the rows', async () => {
        servePage([entry({ message: '예전 것' })]);
        const { unmount, client } = renderPage();
        await screen.findByText('예전 것');
        unmount();

        // Past the stale time the held rows are still worth showing — a blank screen while
        // the refetch runs is worse, which is what `staleTime` (not `gcTime`) buys.
        vi.setSystemTime(Date.now() + CORPUS_STALE_MS + 1);
        servePage([entry({ message: '새로 걷은 것' }, 'fresh')]);

        renderPage('/report-logs', client);

        // Held rows first, without waiting for the network.
        expect(screen.getByText('예전 것')).toBeTruthy();
        // Then the refetch replaces them.
        expect(await screen.findByText('새로 걷은 것')).toBeTruthy();
    });

    it('collects again when the operator asks, held rows or not', async () => {
        servePage([entry()]);
        renderPage();
        await screen.findByText('1건 전수 수집 완료');
        const spent = fetchReportLogs.mock.calls.length;

        fireEvent.click(screen.getByText('다시 수집'));

        await waitFor(() => expect(fetchReportLogs.mock.calls.length).toBeGreaterThan(spent));
    });

    it('surfaces a failure with a retry instead of an empty screen', async () => {
        fetchReportLogs.mockRejectedValue(new Error('403 FORBIDDEN'));

        renderPage();

        expect(await screen.findByText(/403 FORBIDDEN/)).toBeTruthy();
        expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
    });
});

describe('ReportLogsPage — 서버 축 vs 수집분 축', () => {
    it('re-queries when a server axis changes', async () => {
        servePage([entry()]);
        renderPage();
        await screen.findByText('1건 전수 수집 완료');
        const before = fetchReportLogs.mock.calls.length;

        fireEvent.change(screen.getByLabelText('레벨'), { target: { value: 'warn' } });

        await waitFor(() => expect(fetchReportLogs.mock.calls.length).toBeGreaterThan(before));
        expect(lastParams().level).toBe('warn');
    });

    it('does NOT re-query when a client axis changes', async () => {
        servePage([entry(), entry({ tag: 'chat', message: '다른 태그' })]);
        renderPage();
        await screen.findByText('2건 전수 수집 완료');
        const before = fetchReportLogs.mock.calls.length;

        // The whole point of splitting the axes: typing must not throw away the corpus.
        fireEvent.change(screen.getByLabelText('검색'), { target: { value: '다른' } });

        await waitFor(() => expect(screen.queryByText('로그인 실패')).toBeNull());
        expect(screen.getByText('다른 태그')).toBeTruthy();
        expect(fetchReportLogs.mock.calls.length).toBe(before);
    });

    it('keeps facet options from the corpus, not from what is currently shown', async () => {
        servePage([entry(), entry({ tag: 'chat', message: '다른 태그' })]);
        renderPage();
        await screen.findByText('2건 전수 수집 완료');

        fireEvent.change(screen.getByLabelText('태그 (2)'), { target: { value: 'chat' } });

        // Still two options after selecting one — otherwise there is no way back.
        await waitFor(() => expect(screen.getByLabelText('태그 (2)')).toBeTruthy());
    });
});

describe('ReportLogsPage — 추적 핀', () => {
    it('pins a uid from the row and narrows the query server-side', async () => {
        servePage([entry()]);
        renderPage();
        await screen.findByText('1건 전수 수집 완료');

        fireEvent.click(screen.getByTitle('유저 u1 로 추적 (서버 조회)'));

        await waitFor(() => expect(lastParams().uid).toBe('u1'));
        expect(screen.getByText('추적 중')).toBeTruthy();
    });

    it('warns that issue records cannot be reached by a uid pin', async () => {
        servePage([entry()]);
        renderPage();
        await screen.findByText('1건 전수 수집 완료');

        fireEvent.click(screen.getByTitle('유저 u1 로 추적 (서버 조회)'));

        // Slack reports carry no hoisted uid, so the pin silently excludes them —
        // saying so is the difference between "this user has no reports" and "I cannot see them".
        expect(await screen.findByText(/제보 레코드는 uid 축이 없어/)).toBeTruthy();
    });

    it('pinning a runId opens the timeline for that run', async () => {
        servePage([entry({ timestamp: 2_000 }), entry({ message: '먼저 일어난 일', timestamp: 1_000 })]);
        renderPage();
        await screen.findByText('2건 전수 수집 완료');

        fireEvent.click(screen.getAllByTitle('실행 run-a 로 추적 (서버 조회)')[0]);

        // The timeline is ascending, so the earlier event leads.
        const timeline = await screen.findByRole('list');
        const items = within(timeline).getAllByRole('button');
        expect(items[0].textContent).toContain('먼저 일어난 일');
    });

    it('unpinning a runId leaves the timeline rather than drawing nothing', async () => {
        servePage([entry()]);
        renderPage('/report-logs?runId=run-a&mode=timeline');
        await screen.findByText('1건 전수 수집 완료');

        fireEvent.click(screen.getByRole('button', { name: '실행 추적 해제' }));

        await waitFor(() => expect(screen.queryByText('추적 중')).toBeNull());
        // The axes settle before a walk starts, so the wire params catch up a beat later.
        await waitFor(() => expect(lastParams().runId).toBeUndefined());
    });
});

describe('ReportLogsPage — 상세', () => {
    it('opens the detail beside the list, not over it', async () => {
        servePage([entry()]);
        renderPage();
        await screen.findByText('1건 전수 수집 완료');

        fireEvent.click(screen.getByText('로그인 실패'));

        // Detail content present *and* the row still there — the drawer used to cover it.
        // The message appearing twice is the assertion: once in the list, once in the panel.
        expect(await screen.findByText('Log Entry')).toBeTruthy();
        expect(screen.getAllByText('로그인 실패')).toHaveLength(2);
    });

    it('shows a placeholder until a row is chosen', async () => {
        servePage([entry()]);
        renderPage();

        expect(await screen.findByText('행을 선택하면 상세가 여기에 열립니다.')).toBeTruthy();
    });
});

describe('ReportLogsPage — 발생 시각', () => {
    it('orders the list by occurrence, not by arrival', async () => {
        // Arrival order is the reverse of what happened — one batch upload.
        servePage([
            entry({ message: '나중에 일어난 일', timestamp: 9_000 }, 'x1'),
            entry({ message: '먼저 일어난 일', timestamp: 1_000 }, 'x2'),
        ]);
        renderPage();
        await screen.findByText('2건 전수 수집 완료');

        const rows = screen.getAllByRole('row').slice(1);
        expect(rows[0].textContent).toContain('나중에 일어난 일');
    });

    it('flags a row whose upload lagged its occurrence', async () => {
        servePage([entry({ timestamp: 1_700_000_000_000 - 600_000 })]);
        renderPage();
        await screen.findByText('1건 전수 수집 완료');

        expect(screen.getByText('지연')).toBeTruthy();
    });
});
