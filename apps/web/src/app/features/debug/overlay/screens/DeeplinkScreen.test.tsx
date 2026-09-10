import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DeeplinkScreen } from './DeeplinkScreen';

const openURL = jest.fn();

jest.mock('../../../../bridge', () => ({ appBridge: { openURL: (u: string) => openURL(u) } }));
jest.mock('@chatic/bridges', () => ({ isNative: () => true }));
// DEV 빌드를 가정한다 — 하드코딩된 'chatic'이었다면 여기서 드러난다.
jest.mock('@chatic/config', () => ({ config: { get: () => 'chatic-dev' } }));

describe('DeeplinkScreen', () => {
    beforeEach(() => jest.clearAllMocks());

    it('상대경로를 이 빌드의 스킴으로 바꿔 앱에 보낸다', async () => {
        render(<DeeplinkScreen />);

        await userEvent.click(screen.getByRole('button', { name: /앱으로 보내기/ }));

        expect(openURL).toHaveBeenCalledWith('chatic-dev://home');
    });

    it('보낼 주소를 누르기 전에 미리 보여준다', () => {
        render(<DeeplinkScreen />);

        expect(screen.getByText('보낼 주소: chatic-dev://home')).toBeInTheDocument();
    });

    it('입력한 딥링크를 그대로 쓴다', async () => {
        render(<DeeplinkScreen />);
        const field = screen.getByPlaceholderText(/\/chats/);
        await userEvent.clear(field);
        await userEvent.type(field, '/s?code=invt');

        await userEvent.click(screen.getByRole('button', { name: /앱으로 보내기/ }));

        expect(openURL).toHaveBeenCalledWith('chatic-dev://s?code=invt');
    });

    // 다른 채널이 이 빌드를 잡지 않는지 확인하는 프리셋이라, 스킴을 다시 쓰면 시험 자체가 무의미해진다.
    it('교차 확인 프리셋은 적힌 스킴을 유지한다', async () => {
        render(<DeeplinkScreen />);

        await userEvent.click(screen.getByRole('button', { name: 'PROD 스킴 (교차 확인)' }));

        expect(openURL).toHaveBeenCalledWith('chatic://s');
    });

    // openURL은 post 기반이라 앱이 라우팅했는지 알 수 없다 — "보냄"까지만 말한다.
    it('보낸 기록은 라우팅 성공이 아니라 보냈다는 사실만 적는다', async () => {
        render(<DeeplinkScreen />);

        await userEvent.click(screen.getByRole('button', { name: /앱으로 보내기/ }));

        expect(await screen.findByText(/보냄 → chatic-dev:\/\/home/)).toBeInTheDocument();
        expect(screen.queryByText(/라우팅/)).not.toBeInTheDocument();
    });

    it('빈 입력이면 보내기가 잠긴다', async () => {
        render(<DeeplinkScreen />);
        await userEvent.clear(screen.getByPlaceholderText(/\/chats/));

        expect(screen.getByRole('button', { name: /앱으로 보내기/ })).toBeDisabled();
        expect(openURL).not.toHaveBeenCalled();
    });
});
