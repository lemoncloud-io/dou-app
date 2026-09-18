import '@testing-library/jest-dom';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BootRecordsScreen } from './BootRecordsScreen';
import { resetUnsupportedCommands } from '../../hooks';

const fetchBootRecords = jest.fn();
const clearBootRecords = jest.fn();

jest.mock('../../../../bridge', () => ({
    appBridge: {
        fetchBootRecords: (...args: unknown[]) => fetchBootRecords(...args),
        clearBootRecords: (...args: unknown[]) => clearBootRecords(...args),
    },
}));
jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
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
    beforeEach(() => {
        jest.clearAllMocks();
        // Learning is module-scoped, so what one case learns must not leak into the next.
        resetUnsupportedCommands();
    });

    it('네이티브 마일스톤과 총 부팅 시간을 기록마다 보여준다', async () => {
        fetchBootRecords.mockImplementation(() => ok());
        render(<BootRecordsScreen />);

        expect(await screen.findByText('980 ms')).toBeInTheDocument(); // total boot
        expect(screen.getByText('975 ms')).toBeInTheDocument(); // web-app-ready
        expect(screen.getByText('provider ready')).toBeInTheDocument();
        expect(screen.getByText('12 ms')).toBeInTheDocument();
        expect(screen.getByText('1건')).toBeInTheDocument();
    });

    // These two are not the value of any one record but the state of the app currently running — that's why they arrive together in the same request.
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

    // An older app doesn't know this command and answers NOT_FOUND. Saying "there are no
    // records" at that point would be a lie — not being able to ask is different from asking and
    // finding nothing.
    it('앱이 명령을 모르면 버전 차이로 말하고, 기록 없음이라고 하지 않는다', async () => {
        fetchBootRecords.mockImplementation(() => Promise.reject({ code: 'NOT_FOUND' }));
        render(<BootRecordsScreen />);

        expect(await screen.findByText(/이 앱 버전이 지원하지 않습니다/)).toBeInTheDocument();
        expect(screen.queryByText(/기록이 없습니다/)).not.toBeInTheDocument();
    });

    // Locking the button is more honest than continuing to offer one that does nothing when pressed.
    it('명령을 모른다고 배우면 버튼을 잠근다', async () => {
        fetchBootRecords.mockImplementation(() => Promise.reject({ code: 'NOT_FOUND' }));
        render(<BootRecordsScreen />);
        await screen.findByText(/이 앱 버전이 지원하지 않습니다/);

        expect(screen.getByRole('button', { name: '새로고침' })).toBeDisabled();
    });

    it('일반 실패는 버전 차이와 구분해 적는다', async () => {
        fetchBootRecords.mockImplementation(() => Promise.reject(new Error('storage down')));
        render(<BootRecordsScreen />);

        expect(await screen.findByText(/실패: storage down/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '새로고침' })).not.toBeDisabled();
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
