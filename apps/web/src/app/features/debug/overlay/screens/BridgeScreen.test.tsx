import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BridgeScreen } from './BridgeScreen';
import { setDebugLanguageForTests } from '../../i18n';

const request = jest.fn();
const post = jest.fn();
jest.mock('@chatic/bridges', () => ({
    isNative: () => false,
    webClient: {
        request: (message: unknown) => request(message),
        post: (message: unknown) => post(message),
    },
    BRIDGE_VERSION_INFO: { bridgeVersion: '2.2.0', protocolVersion: '2.2.0' },
}));

describe('BridgeScreen — 채널 점검과 임의 명령', () => {
    let restoreLanguage: () => void;

    beforeEach(() => {
        jest.clearAllMocks();
        request.mockResolvedValue({ data: { payload: 'pong' } });
        restoreLanguage = setDebugLanguageForTests('en');
    });

    afterEach(() => restoreLanguage());

    // A browser has no shell — that's why this screen's first question is "is there a channel".
    it('셸 채널이 없으면 없다고 말한다', () => {
        render(<BridgeScreen />);

        expect(screen.getByText('isNative()')).toBeInTheDocument();
        expect(screen.getAllByText('Absent').length).toBeGreaterThanOrEqual(3);
    });

    it('request는 응답과 걸린 시간을 기록에 남긴다', async () => {
        render(<BridgeScreen />);

        await userEvent.click(screen.getByRole('button', { name: /request/ }));

        expect(request).toHaveBeenCalledWith({ type: 'Ping', data: {} });
        expect(await screen.findByText(/pong/)).toBeInTheDocument();
        expect(screen.getByText('Exchange log (1)')).toBeInTheDocument();
    });

    // Failure is a result too: showing the code and message as-is is what distinguishes a version issue from a channel issue.
    it('거절당하면 코드와 메시지를 남긴다', async () => {
        request.mockRejectedValue({ code: 'NATIVE_NOT_SUPPORTED', message: '브릿지 없음' });
        render(<BridgeScreen />);

        await userEvent.click(screen.getByRole('button', { name: /request/ }));

        expect(await screen.findByText(/NATIVE_NOT_SUPPORTED: 브릿지 없음/)).toBeInTheDocument();
    });

    // post gets no answer — writing "succeeded" would claim a confirmation that was never made.
    it('post는 확인 없음을 명시한다', async () => {
        render(<BridgeScreen />);

        await userEvent.click(screen.getByRole('button', { name: /post/ }));

        expect(post).toHaveBeenCalledWith({ type: 'Ping', data: {} });
        expect(screen.getByText('Sent (no confirmation)')).toBeInTheDocument();
    });

    it('payload가 JSON이 아니면 보내지 않고 이유를 말한다', async () => {
        render(<BridgeScreen />);

        const payload = screen.getByLabelText('payload (JSON)');
        await userEvent.clear(payload);
        await userEvent.type(payload, '{{');
        await userEvent.click(screen.getByRole('button', { name: /request/ }));

        expect(request).not.toHaveBeenCalled();
        expect(screen.getByText(/payload parse failed/)).toBeInTheDocument();
    });
});
