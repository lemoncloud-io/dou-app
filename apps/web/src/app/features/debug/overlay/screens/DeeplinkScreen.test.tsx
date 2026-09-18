import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DeeplinkScreen } from './DeeplinkScreen';

const openURL = jest.fn();

jest.mock('../../../../bridge', () => ({ appBridge: { openURL: (u: string) => openURL(u) } }));
jest.mock('@chatic/bridges', () => ({ isNative: () => true }));
// Assumes a DEV build — a hardcoded 'chatic' would show up here.
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

    // This preset checks that another channel doesn't catch this build, so rewriting the scheme would make the test pointless.
    it('교차 확인 프리셋은 적힌 스킴을 유지한다', async () => {
        render(<DeeplinkScreen />);

        await userEvent.click(screen.getByRole('button', { name: 'PROD 스킴 (교차 확인)' }));

        expect(openURL).toHaveBeenCalledWith('chatic://s');
    });

    // openURL is post-based, so whether the app routed it is unknown — it only says "sent".
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
