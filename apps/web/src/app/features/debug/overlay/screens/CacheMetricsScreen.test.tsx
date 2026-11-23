import '@testing-library/jest-dom';

import { render, screen, within } from '@testing-library/react';

import { setDebugLanguageForTests } from '../../i18n';
import { CacheMetricsScreen } from './CacheMetricsScreen';

const read = jest.fn();
const reset = jest.fn();

jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        boot: {
            isNativeApp: () => true,
        },
        data: {
            getCacheMetricsSource: () => ({
                read: (...args: unknown[]) => read(...args),
                reset: (...args: unknown[]) => reset(...args),
            }),
        },
    })
);
jest.mock('../../lib', () => ({ copyText: jest.fn() }));

const metrics = read;

const dataRows = () => screen.getAllByRole('row').slice(1);

describe('CacheMetricsScreen', () => {
    let restoreLanguage: () => void;
    beforeEach(() => {
        restoreLanguage = setDebugLanguageForTests('en');
    });
    afterEach(() => restoreLanguage());

    it('아직 호출이 없으면 빈 상태를 보여준다', () => {
        metrics.mockResolvedValue({ totalOps: 0, operations: {} });

        render(<CacheMetricsScreen />);

        expect(screen.getByText('No calls recorded yet.')).toBeInTheDocument();
    });

    it('평균이 아니라 누적 시간 순으로 정렬한다', async () => {
        metrics.mockResolvedValue({
            totalOps: 201,
            operations: {
                'loadAll:chat': { count: 1, avgMs: 300, maxMs: 300 },
                'load:channel': { count: 200, avgMs: 5, maxMs: 40 },
            },
        });

        render(<CacheMetricsScreen />);
        await screen.findByText('load:channel');

        const rows = dataRows();
        expect(within(rows[0]).getByText('load:channel')).toBeInTheDocument();
        expect(within(rows[0]).getByText('1,000ms')).toBeInTheDocument();
        expect(within(rows[1]).getByText('loadAll:chat')).toBeInTheDocument();
    });

    it('총 호출 수와 누적 시간을 합산해 보여준다', async () => {
        metrics.mockResolvedValue({
            totalOps: 201,
            operations: {
                'loadAll:chat': { count: 1, avgMs: 300, maxMs: 300 },
                'load:channel': { count: 200, avgMs: 5, maxMs: 40 },
            },
        });

        render(<CacheMetricsScreen />);

        expect(await screen.findByText(/201 total calls/)).toBeInTheDocument();
        expect(screen.getByText(/1,300ms cumulative/)).toBeInTheDocument();
    });

    it('renders the Korean table when the app language is Korean', () => {
        restoreLanguage();
        restoreLanguage = setDebugLanguageForTests('ko');
        metrics.mockResolvedValue({ totalOps: 0, operations: {} });

        render(<CacheMetricsScreen />);

        expect(screen.getByText('아직 기록된 호출이 없습니다.')).toBeInTheDocument();
    });
});
