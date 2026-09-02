import '@testing-library/jest-dom';

import { render, screen, within } from '@testing-library/react';

import { CacheMetricsScreen } from './CacheMetricsScreen';

const read = jest.fn();
const reset = jest.fn();

jest.mock('@chatic/app-runtime', () => ({
    isNativeApp: () => true,
    getCacheMetricsSource: () => ({
        read: (...args: unknown[]) => read(...args),
        reset: (...args: unknown[]) => reset(...args),
    }),
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

    // 정렬 기준이 평균이 아니라 누적(count × avg)인 것이 이 화면의 요점 — 빠르지만 자주 불리는
    // 호출이 느리지만 드문 호출보다 위에 와야 옵저버 재조회 패턴이 눈에 띈다.
    it('평균이 아니라 누적 시간 순으로 정렬한다', () => {
        metrics.mockReturnValue({
            totalOps: 201,
            operations: {
                'loadAll:chat': { count: 1, avgMs: 300, maxMs: 300 }, // 느리지만 드묾 → 누적 300
                'load:channel': { count: 200, avgMs: 5, maxMs: 40 }, // 빠르지만 잦음 → 누적 1000
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
