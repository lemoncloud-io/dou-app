import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LogBufferScreen } from './LogBufferScreen';
import { getLogQueueView } from '../../../../runtime/logging/logQueueView';

const flush = jest.fn();
const view = { snapshot: () => [], clear: jest.fn(), flush: () => flush() };
let current: typeof view | undefined = view;

jest.mock('../../../../runtime/logging/logQueueView', () => ({ getLogQueueView: () => current }));
jest.mock('../../../../runtime/logging/logUploadSwitch', () => ({
    isLogUploadHeld: () => false,
    isLogUploadHeldByApp: () => false,
    setLogUploadHold: jest.fn(),
}));
jest.mock('@chatic/bridges', () => ({
    logger: { warn: jest.fn() },
    isNative: () => true,
}));
jest.mock('../../../../bridge', () => ({
    appBridge: {
        fetchLogUploadQueue: () => Promise.resolve({ data: { logs: [], size: 0 } }),
        ackLogUploadQueue: jest.fn(),
        clearLogUploadQueue: () => Promise.resolve({ data: { success: true } }),
    },
}));
// `../../lib`은 목하지 않는다 — 순수 함수 모음이고, 표면을 추측해 목하면 이번처럼
// 실제 이름(`filterLogs`)과 어긋난다.

describe('LogBufferScreen — 지금 보내기 (ADR-0080 결정 14)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        current = view;
    });

    it('예정 밖 전송을 큐 뷰를 통해 부른다', async () => {
        flush.mockResolvedValue(undefined);
        render(<LogBufferScreen />);

        await userEvent.click(screen.getByRole('button', { name: '지금 보내기' }));

        expect(flush).toHaveBeenCalledTimes(1);
        expect(await screen.findByText(/보냈습니다/)).toBeInTheDocument();
    });

    // 업로더가 없을 때 조용히 넘어가면 누른 사람에게는 "보냈다"로 읽힌다.
    it('업로더가 돌지 않으면 그 사실을 말한다 — 보낸 척하지 않는다', async () => {
        current = undefined;
        render(<LogBufferScreen />);

        await userEvent.click(screen.getByRole('button', { name: '지금 보내기' }));

        expect(await screen.findByText(/돌고 있지 않습니다/)).toBeInTheDocument();
        expect(flush).not.toHaveBeenCalled();
    });

    it('전송이 실패하면 보냈다고 하지 않는다', async () => {
        flush.mockRejectedValue(new Error('network'));
        render(<LogBufferScreen />);

        await userEvent.click(screen.getByRole('button', { name: '지금 보내기' }));

        expect(await screen.findByText(/flush failed/)).toBeInTheDocument();
        expect(screen.queryByText(/보냈습니다/)).not.toBeInTheDocument();
    });
});

it('큐 뷰 접근자를 통해 읽는다', () => {
    expect(typeof getLogQueueView).toBe('function');
});
