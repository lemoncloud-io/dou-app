import '@testing-library/jest-dom';

import { render, screen, within } from '@testing-library/react';

import { CacheMetricsScreen } from './CacheMetricsScreen';

const read = jest.fn();
const reset = jest.fn();

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        boot: {
            isNativeApp: () => true,
        },
        data: {
            getCacheMetricsSource: () => ({
                read: (...args: unknown[]) => read(...args),
                reset: (...args: unknown[]) => reset(...args),
            }),
        },
    },
}));
jest.mock('../../lib', () => ({ copyText: jest.fn() }));

const metrics = read;

const dataRows = () => screen.getAllByRole('row').slice(1); // drop the header row

describe('CacheMetricsScreen', () => {
    it('아직 호출이 없으면 빈 상태를 보여준다', () => {
        metrics.mockReturnValue({ totalOps: 0, operations: {} });

        render(<CacheMetricsScreen />);

        expect(screen.getByText('아직 기록된 호출이 없습니다.')).toBeInTheDocument();
    });

    // The whole point of this screen is that sort order is by cumulative time (count × avg), not
    // average — a fast but frequently-called call must rank above a slow but rare one for the
    // observer re-fetch pattern to stand out.
    it('평균이 아니라 누적 시간 순으로 정렬한다', () => {
        metrics.mockReturnValue({
            totalOps: 201,
            operations: {
                'loadAll:chat': { count: 1, avgMs: 300, maxMs: 300 }, // slow but rare → cumulative 300
                'load:channel': { count: 200, avgMs: 5, maxMs: 40 }, // fast but frequent → cumulative 1000
            },
        });

        render(<CacheMetricsScreen />);

        const rows = dataRows();
        expect(within(rows[0]).getByText('load:channel')).toBeInTheDocument();
        expect(within(rows[0]).getByText('1,000ms')).toBeInTheDocument();
        expect(within(rows[1]).getByText('loadAll:chat')).toBeInTheDocument();
    });

    it('총 호출 수와 누적 시간을 합산해 보여준다', () => {
        metrics.mockReturnValue({
            totalOps: 201,
            operations: {
                'loadAll:chat': { count: 1, avgMs: 300, maxMs: 300 },
                'load:channel': { count: 200, avgMs: 5, maxMs: 40 },
            },
        });

        render(<CacheMetricsScreen />);

        expect(screen.getByText(/총 201회/)).toBeInTheDocument();
        expect(screen.getByText(/누적 1,300ms/)).toBeInTheDocument();
    });
});
