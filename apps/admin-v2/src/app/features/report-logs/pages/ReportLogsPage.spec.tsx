/**
 * `pages/ReportLogsPage.spec.tsx`
 *
 * The assembled console against a fake list endpoint: which tab opens, that every tab's state
 * survives the URL, the hops between tabs (a report to its user's timeline, an incident to its
 * cases), the empty states' next step, and the language switch. The full-log tab's own wiring is
 * covered in `tabs/AllLogsTab.spec.tsx`.
 *
 * The console sits behind the admin OAuth gate, so this stands in for clicking through it.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n, LANGUAGE_STORAGE_KEY } from '../../../i18n';
import { LanguageSwitch } from '../../../layout/PrivateLayout';
import type * as ReportLogApi from '../api/reportLogApi';
import type { RawMockView, ReportLogListResponse } from '../api/reportLogApi';

const fetchReportLogs = vi.fn<(params?: Record<string, unknown>) => Promise<ReportLogListResponse>>();

vi.mock('../api/reportLogApi', async () => {
    const actual = await vi.importActual<typeof ReportLogApi>('../api/reportLogApi');
    return { ...actual, fetchReportLogs: (params?: Record<string, unknown>) => fetchReportLogs(params) };
});

const { ReportLogsPage } = await import('./ReportLogsPage');

// 2026-10-26 14:30 KST.
const NOW = Date.parse('2026-10-26T14:30:00+09:00');
const MIN = 60_000;

const entry = (meta: Record<string, unknown>, id = Math.random().toString(), at = NOW - 10 * MIN): RawMockView => ({
    id,
    createdAt: at,
    stereo: 'log',
    meta: { level: 'info', tag: 'CHAT', message: 'opened room', timestamp: at, uid: 'u1', runId: 'run-a', ...meta },
});

const issue = (id: string, uid: string, at = NOW - 30 * MIN): RawMockView => ({
    id,
    createdAt: at,
    stereo: 'issue',
    meta: {
        title: '[web] issue: Photos do not send',
        message: JSON.stringify({
            message: 'I tried three times',
            user: { uid, name: 'Kim' },
            version: { appVersion: '0.29.2' },
        }),
    },
});

type Route = (params: Record<string, unknown>) => ReportLogListResponse | undefined;

/** Answer each request by its parameters; anything unmatched gets an empty page. */
const serve = (...routes: Route[]) =>
    fetchReportLogs.mockImplementation(async (params = {}) => {
        for (const route of routes) {
            const answer = route(params);
            if (answer) return answer;
        }
        return { list: [], total: 0 };
    });

let location = '';
const LocationProbe = () => {
    const { search } = useLocation();
    location = search;
    return null;
};

const renderPage = (initial = '/report-logs') =>
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter initialEntries={[initial]}>
                <LanguageSwitch />
                <ReportLogsPage />
                <LocationProbe />
            </MemoryRouter>
        </QueryClientProvider>
    );

const params = () => new URLSearchParams(location);
const calls = () => fetchReportLogs.mock.calls.map(call => call[0] ?? {});

beforeEach(async () => {
    fetchReportLogs.mockReset();
    serve();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    window.localStorage.clear();
    await act(() => i18n.changeLanguage('ko'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('ReportLogsPage — tabs and the URL', () => {
    it('opens on the user tab, in Korean, on the production server', async () => {
        renderPage();

        expect(screen.getByRole('button', { name: '사용자 찾기' }).getAttribute('aria-current')).toBe('page');
        expect(screen.getByRole('radio', { name: '운영' }).getAttribute('aria-checked')).toBe('true');
        expect(screen.getByRole('heading', { name: '로그 콘솔' })).toBeTruthy();
        await waitFor(() => expect(fetchReportLogs).toHaveBeenCalled());
        expect(calls()[0]).toMatchObject({ stage: 'v1', from: '2026-10-20', to: '2026-10-26' });
    });

    it('restores a tab, its server and its period from a link', async () => {
        renderPage('/report-logs?tab=errors&stage=d1&period=1h');

        expect(screen.getByRole('button', { name: '에러' }).getAttribute('aria-current')).toBe('page');
        expect(screen.getByRole('radio', { name: '개발' }).getAttribute('aria-checked')).toBe('true');
        expect(screen.getByRole('button', { name: '최근 1시간' }).getAttribute('aria-pressed')).toBe('true');
        await waitFor(() => expect(calls().some(call => call.stage === 'd1' && call.level === 'error')).toBe(true));
    });

    it('keeps only the server when moving to another tab, and writes it to the URL', async () => {
        renderPage('/report-logs?tab=errors&stage=d1&period=1h');

        fireEvent.click(screen.getByRole('button', { name: '이슈 제보' }));

        expect(params().toString()).toBe('tab=reports&stage=d1');
        expect(screen.getByRole('button', { name: '최근 7일' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('opens a link written before the tabs on the full-log tab', () => {
        renderPage('/report-logs?uid=u1&mode=timeline&runId=run-a');

        expect(screen.getByRole('button', { name: '전체 로그' }).getAttribute('aria-current')).toBe('page');
    });
});

describe('ReportLogsPage — user tab', () => {
    it('finds a user by id and reads their session as sentences', async () => {
        serve(p =>
            p.uid === 'u1'
                ? {
                      list: [
                          entry({ message: 'opened room' }, 'a1', NOW - 12 * MIN),
                          entry({ level: 'error', message: 'send failed' }, 'a2', NOW - 11 * MIN),
                      ],
                      total: 2,
                  }
                : undefined
        );
        renderPage();

        fireEvent.change(screen.getByRole('searchbox', { name: '사용자 ID' }), { target: { value: 'u1' } });
        fireEvent.click(screen.getByRole('button', { name: '찾기' }));

        expect(params().get('uid')).toBe('u1');
        expect(await screen.findByRole('heading', { name: '사용자 u1' })).toBeTruthy();
        expect(await screen.findByText('앱 사용 기록 1회')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { expanded: false }));
        const timeline = await screen.findByRole('list', { name: '시간순 기록' });
        expect(within(timeline).getByText('채팅 · opened room')).toBeTruthy();
        expect(within(timeline).getByText('채팅 · send failed')).toBeTruthy();
        expect(params().get('run')).toBe('run-a');

        fireEvent.click(within(timeline).getByRole('button', { name: '자세히' }));
        expect(await screen.findByRole('complementary', { name: /./ })).toBeTruthy();
    });

    it('lists the users seen in the period before one is chosen', async () => {
        serve(p => (p.uid ? undefined : { list: [entry({ uid: 'u7' }, 'x1')], total: 1 }));
        renderPage();

        fireEvent.click(await screen.findByRole('button', { name: /사용자 u7/ }));

        expect(params().get('uid')).toBe('u7');
    });

    it('says what to check when the user has no records', async () => {
        renderPage('/report-logs?uid=nobody');

        expect(await screen.findByText('이 기간에 이 사용자의 기록이 없어요')).toBeTruthy();
        expect(screen.getByText('사용자 ID와 운영/개발 서버가 맞는지 확인해 보세요.')).toBeTruthy();
    });

    it('opens the session that was going on at a report time', async () => {
        const at = NOW - 11 * MIN;
        serve(p =>
            p.uid === 'u1' ? { list: [entry({ message: 'opened room' }, 'a1', NOW - 12 * MIN)], total: 1 } : undefined
        );
        renderPage(`/report-logs?tab=user&uid=u1&at=${at}`);

        expect(await screen.findByRole('list', { name: '시간순 기록' })).toBeTruthy();
        expect(calls().find(call => call.uid === 'u1')).toMatchObject({ from: '2026-10-26', to: '2026-10-26' });
    });
});

describe('ReportLogsPage — user tab, clouds and runs', () => {
    it('lets a uid seen in several clouds be narrowed to one, on the server', async () => {
        serve(p =>
            p.uid === 'u1'
                ? {
                      list: [
                          entry({ cid: 'c1', message: 'in one' }, 'k1', NOW - 12 * MIN),
                          entry({ cid: 'c2', runId: 'run-b', message: 'in two' }, 'k2', NOW - 20 * MIN),
                      ],
                      total: 2,
                  }
                : undefined
        );
        renderPage('/report-logs?tab=user&uid=u1');

        expect(await screen.findByText(/클라우드 2곳의 기록이 섞여 있어요/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '클라우드 c2' }));

        expect(params().get('cloud')).toBe('c2');
        await waitFor(() => expect(calls().some(call => call.uid === 'u1' && call.cid === 'c2')).toBe(true));
    });

    it('closes a run that was opened from a report time', async () => {
        const at = NOW - 11 * MIN;
        serve(p => (p.uid === 'u1' ? { list: [entry({}, 'a1', NOW - 12 * MIN)], total: 1 } : undefined));
        renderPage(`/report-logs?tab=user&uid=u1&at=${at}`);

        expect(await screen.findByRole('list', { name: '시간순 기록' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { expanded: true }));

        await waitFor(() => expect(screen.queryByRole('list', { name: '시간순 기록' })).toBeNull());
    });

    it('never fetches everyone again while switching to a user', async () => {
        renderPage();
        await waitFor(() => expect(calls().length).toBe(1));

        fireEvent.change(screen.getByRole('searchbox', { name: '사용자 ID' }), { target: { value: 'u5' } });
        fireEvent.click(screen.getByRole('button', { name: '찾기' }));

        await waitFor(() => expect(calls().some(call => call.uid === 'u5')).toBe(true));
        // Only the first, deliberate "everyone" request: none with an empty user while the new one settles.
        expect(calls().filter(call => !call.uid && !call.type)).toHaveLength(1);
    });
});

describe('ReportLogsPage — errors tab', () => {
    it('asks the server to count by incident and shows its numbers when the rows fall short', async () => {
        serve(
            p =>
                p.groupBy
                    ? { list: [], total: 940, stats: { groups: { tag: [{ key: 'CHAT', val: 900 }] }, users: 120 } }
                    : undefined,
            p =>
                p.level === 'error'
                    ? {
                          list: Array.from({ length: 500 }, (_, i) =>
                              entry({ level: 'error', message: 'send failed' }, `e${i}`)
                          ),
                          total: 940,
                      }
                    : undefined
        );
        renderPage('/report-logs?tab=errors');

        expect(await screen.findByText('900건')).toBeTruthy();
        expect(screen.getByText('940')).toBeTruthy();
        expect(screen.getByText('120')).toBeTruthy();
        const stats = calls().find(call => call.groupBy);
        expect(stats).toMatchObject({ level: 'error', groupBy: ['tag'], interval: 'hour', users: true, limit: 1 });
    });

    it('opens an incident into its cases, narrowed to the tag on the server', async () => {
        serve(p =>
            p.level === 'error'
                ? { list: [entry({ level: 'error', message: 'send failed' }, 'e1')], total: 1 }
                : undefined
        );
        renderPage('/report-logs?tab=errors');

        fireEvent.click(await screen.findByRole('button', { name: /채팅/ }));

        expect(params().get('event')).toBe('CHAT');
        await waitFor(() => expect(calls().some(call => call.tag === 'CHAT' && call.level === 'error')).toBe(true));
        fireEvent.click(await screen.findByRole('button', { name: '이 사용자의 그때 기록' }));
        expect(params().get('tab')).toBe('user');
        expect(params().get('uid')).toBe('u1');
        expect(params().get('at')).toBe(String(NOW - 10 * MIN));
    });

    it('offers to widen the period when there were no errors', async () => {
        renderPage('/report-logs?tab=errors');

        fireEvent.click(await screen.findByRole('button', { name: '기간 넓히기' }));

        expect(params().get('period')).toBe('7d');
    });
});

describe('ReportLogsPage — reports tab', () => {
    it('lists reports and opens the reporter timeline around the report time', async () => {
        const at = NOW - 30 * MIN;
        serve(p => (p.type === 'issue' ? { list: [issue('rep1', 'u9', at)], total: 1 } : undefined));
        renderPage('/report-logs?tab=reports');

        fireEvent.click(await screen.findByRole('button', { name: /Photos do not send/ }));
        expect(params().get('report')).toBe('rep1');
        // Once as the message, once more inside the folded developer details.
        expect((await screen.findAllByText('I tried three times')).length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole('button', { name: '그때 이 사용자 로그 보기' }));

        expect(params().get('tab')).toBe('user');
        expect(params().get('uid')).toBe('u9');
        expect(params().get('at')).toBe(String(at));
        await waitFor(() => expect(calls().some(call => call.uid === 'u9')).toBe(true));
    });

    it('fetches reports by their stored type', async () => {
        renderPage('/report-logs?tab=reports');

        await waitFor(() => expect(calls().some(call => call.type === 'issue')).toBe(true));
        expect(await screen.findByText('이 기간에 받은 제보가 없어요')).toBeTruthy();
    });
});

describe('ReportLogsPage — statistics tab', () => {
    it('explains why there are no statistics and when there will be', async () => {
        renderPage('/report-logs?tab=stats');

        expect(await screen.findByText('이 기간에는 통계 기록이 없어요')).toBeTruthy();
        expect(screen.getByText(/0\.29\.2 이상/)).toBeTruthy();
    });

    it('reads a goal against its target', async () => {
        serve(p =>
            p.tag === 'perf.boot'
                ? {
                      list: [900, 1_000, 1_100].map((durationMs, i) =>
                          entry({ tag: 'perf.boot', kind: 'trace', durationMs }, `b${i}`)
                      ),
                      total: 3,
                  }
                : undefined
        );
        renderPage('/report-logs?tab=stats');

        expect(await screen.findByText('앱 시작')).toBeTruthy();
        expect(screen.getByText('목표 안')).toBeTruthy();
    });
});

describe('ReportLogsPage — language', () => {
    it('switches to English, remembers it in this browser and leaves the URL alone', async () => {
        renderPage('/report-logs?tab=errors');
        const before = location;

        fireEvent.click(screen.getByRole('radio', { name: 'English' }));

        expect(await screen.findByRole('button', { name: 'Find a user' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Log Console' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Last 24 hours' })).toBeTruthy();
        expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
        expect(location).toBe(before);
    });
});
