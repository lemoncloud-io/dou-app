import '@testing-library/jest-dom';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BootRecordsScreen } from './BootRecordsScreen';

const fetchBootRecords = jest.fn();
const clearBootRecords = jest.fn();

jest.mock('../../../../bridge', () => ({
    appBridge: {
        fetchBootRecords: (...args: unknown[]) => fetchBootRecords(...args),
        clearBootRecords: (...args: unknown[]) => clearBootRecords(...args),
    },
}));
jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../lib', () => ({ copyText: jest.fn() }));

const record = (over: Record<string, unknown> = {}) => ({
    finalizedAt: 1_700_000_000_000,
    type: 'cold',
    appVersion: '0.24.0',
    native: { 'provider-ready': 12, 'web-app-ready': 975 },
    web: { marks: { mainStartMs: 120, appRenderMs: 300, sessionInitializedMs: 640 } },
    totalMs: 980,
    ...over,
});

const ok = (over: Record<string, unknown> = {}) =>
    Promise.resolve({
        data: { records: [record()], contentProcessReloadCount: 2, lastForegroundResumeMs: 4321, ...over },
    });

describe('BootRecordsScreen', () => {
    beforeEach(() => jest.clearAllMocks());

    it('네이티브 마일스톤과 총 부팅 시간을 기록마다 보여준다', async () => {
        fetchBootRecords.mockImplementation(() => ok());
        render(<BootRecordsScreen />);

        expect(await screen.findByText('980 ms')).toBeInTheDocument(); // 총 부팅
        expect(screen.getByText('975 ms')).toBeInTheDocument(); // web-app-ready
        expect(screen.getByText('provider ready')).toBeInTheDocument();
        expect(screen.getByText('12 ms')).toBeInTheDocument();
        expect(screen.getByText('1건')).toBeInTheDocument();
    });

    // 이 둘은 어느 기록의 값이 아니라 지금 돌고 있는 앱의 상태다 — 그래서 같은 요청으로 함께 온다.
    it('현재 앱 실행의 카운터 두 개를 별 절에 보여준다', async () => {
        fetchBootRecords.mockImplementation(() => ok());
        render(<BootRecordsScreen />);

        expect(await screen.findByText('현재 앱 실행')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('4321 ms')).toBeInTheDocument();
    });

    it('웹 스냅샷이 없는 기록은 그 사실을 적는다', async () => {
        fetchBootRecords.mockImplementation(() => ok({ records: [record({ web: null })] }));
        render(<BootRecordsScreen />);

        expect(await screen.findByText('없음 (타임아웃)')).toBeInTheDocument();
    });

    it('기록이 없으면 재시작하면 남는다고 알려준다', async () => {
        fetchBootRecords.mockImplementation(() => ok({ records: [] }));
        render(<BootRecordsScreen />);

        expect(await screen.findByText(/기록이 없습니다/)).toBeInTheDocument();
    });

    // 구버전 앱은 이 명령을 몰라 reject한다. 그때 "기록이 없다"고 말하면 거짓이다 —
    // 못 물어본 것과 물어봤는데 없는 것은 다르다.
    it('앱이 답하지 못하면 실패를 표시하고, 기록 없음이라고 하지 않는다', async () => {
        fetchBootRecords.mockImplementation(() => Promise.reject(new Error('NOT_FOUND')));
        render(<BootRecordsScreen />);

        expect(await screen.findByText(/앱에서 읽지 못했습니다/)).toBeInTheDocument();
        expect(screen.queryByText(/기록이 없습니다/)).not.toBeInTheDocument();
    });

    it('초기화를 누르면 앱에 지우게 하고 다시 읽는다', async () => {
        fetchBootRecords.mockImplementation(() => ok());
        clearBootRecords.mockImplementation(() => Promise.resolve({ data: { success: true } }));
        render(<BootRecordsScreen />);
        await screen.findByText('980 ms');

        await userEvent.click(screen.getByRole('button', { name: '초기화' }));

        await waitFor(() => expect(clearBootRecords).toHaveBeenCalledTimes(1));
        expect(fetchBootRecords).toHaveBeenCalledTimes(2);
    });

    it('기록이 없으면 초기화 버튼은 눌리지 않는다', async () => {
        fetchBootRecords.mockImplementation(() => ok({ records: [] }));
        render(<BootRecordsScreen />);
        await screen.findByText(/기록이 없습니다/);

        expect(screen.getByRole('button', { name: '초기화' })).toBeDisabled();
    });
});
