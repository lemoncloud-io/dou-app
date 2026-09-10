import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BridgeScreen } from './BridgeScreen';

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
    beforeEach(() => {
        jest.clearAllMocks();
        request.mockResolvedValue({ data: { payload: 'pong' } });
    });

    // 브라우저에는 셸이 없다 — 이 화면의 첫 질문이 "채널이 있느냐"인 이유다.
    it('셸 채널이 없으면 없다고 말한다', () => {
        render(<BridgeScreen />);

        expect(screen.getByText('isNative()')).toBeInTheDocument();
        expect(screen.getAllByText('없음').length).toBeGreaterThanOrEqual(3);
    });

    it('request는 응답과 걸린 시간을 기록에 남긴다', async () => {
        render(<BridgeScreen />);

        await userEvent.click(screen.getByRole('button', { name: /request/ }));

        expect(request).toHaveBeenCalledWith({ type: 'Ping', data: {} });
        expect(await screen.findByText(/pong/)).toBeInTheDocument();
        expect(screen.getByText('주고받은 기록 (1)')).toBeInTheDocument();
    });

    // 실패도 결과다: 코드와 메시지를 그대로 보여줘야 버전 문제인지 채널 문제인지 갈린다.
    it('거절당하면 코드와 메시지를 남긴다', async () => {
        request.mockRejectedValue({ code: 'NATIVE_NOT_SUPPORTED', message: '브릿지 없음' });
        render(<BridgeScreen />);

        await userEvent.click(screen.getByRole('button', { name: /request/ }));

        expect(await screen.findByText(/NATIVE_NOT_SUPPORTED: 브릿지 없음/)).toBeInTheDocument();
    });

    // post는 답이 없다 — 성공했다고 적으면 하지도 않은 확인을 주장하는 셈이다.
    it('post는 확인 없음을 명시한다', async () => {
        render(<BridgeScreen />);

        await userEvent.click(screen.getByRole('button', { name: /post/ }));

        expect(post).toHaveBeenCalledWith({ type: 'Ping', data: {} });
        expect(screen.getByText('보냄 (확인 없음)')).toBeInTheDocument();
    });

    it('payload가 JSON이 아니면 보내지 않고 이유를 말한다', async () => {
        render(<BridgeScreen />);

        const payload = screen.getByLabelText('payload (JSON)');
        await userEvent.clear(payload);
        await userEvent.type(payload, '{{');
        await userEvent.click(screen.getByRole('button', { name: /request/ }));

        expect(request).not.toHaveBeenCalled();
        expect(screen.getByText(/payload 파싱 실패/)).toBeInTheDocument();
    });
});
