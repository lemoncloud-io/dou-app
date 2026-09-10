import '@testing-library/jest-dom';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CopyButton } from './CopyButton';

const copyTextWithResult = jest.fn();
jest.mock('../lib/copyText', () => ({ copyTextWithResult: (value: string) => copyTextWithResult(value) }));

/**
 * What this pins is that the indicator cannot lie: 복사됨 appears only when the copy actually
 * resolved true. A silent button is indistinguishable from a broken one on a device, and a button
 * that always claims success is worse than silent.
 */
describe('CopyButton — 복사와 피드백', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        copyTextWithResult.mockReset();
        copyTextWithResult.mockResolvedValue(true);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    const clickIt = async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        await user.click(screen.getByRole('button'));
    };

    it('기본 라벨은 복사이고, 라벨을 주면 그걸 쓴다', () => {
        const { rerender } = render(<CopyButton value={() => 'x'} />);
        expect(screen.getByRole('button')).toHaveTextContent('복사');

        rerender(<CopyButton value={() => 'x'} label="상태 복사" />);
        expect(screen.getByRole('button')).toHaveTextContent('상태 복사');
    });

    it('누르는 시점의 값을 복사한다', async () => {
        // 화면들이 1초마다 폴링한다 — 마지막 렌더가 아니라 누른 순간의 스냅샷이어야 한다.
        let current = 'first';
        render(<CopyButton value={() => current} />);

        current = 'second';
        await clickIt();

        expect(copyTextWithResult).toHaveBeenCalledWith('second');
    });

    it('성공하면 복사됨을 보여주고 잠시 뒤 되돌아온다', async () => {
        render(<CopyButton value={() => 'x'} label="상태 복사" />);

        await clickIt();
        await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('복사됨'));

        act(() => jest.advanceTimersByTime(1500));
        await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('상태 복사'));
    });

    it('실패하면 실패라고 말한다', async () => {
        // navigator.clipboard가 없는 WebView, 또는 셸이 거절한 경우.
        copyTextWithResult.mockResolvedValue(false);
        render(<CopyButton value={() => 'x'} />);

        await clickIt();

        await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('복사 실패'));
        // 성공보다 오래 남는다 — 읽어야 하는 쪽이다.
        act(() => jest.advanceTimersByTime(1500));
        expect(screen.getByRole('button')).toHaveTextContent('복사 실패');
        act(() => jest.advanceTimersByTime(1500));
        await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('복사'));
    });

    it('표시가 남아 있는 동안 언마운트되어도 터지지 않는다', async () => {
        const { unmount } = render(<CopyButton value={() => 'x'} />);
        await clickIt();

        expect(() => unmount()).not.toThrow();
        expect(() => jest.advanceTimersByTime(3000)).not.toThrow();
    });
});
