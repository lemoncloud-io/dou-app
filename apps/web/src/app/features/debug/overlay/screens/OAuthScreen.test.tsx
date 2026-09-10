import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OAuthScreen } from './OAuthScreen';

const oAuthLogin = jest.fn();
const oAuthLogout = jest.fn();

jest.mock('../../../../bridge', () => ({
    appBridge: { oAuthLogin: (p: string) => oAuthLogin(p), oAuthLogout: (p: string) => oAuthLogout(p) },
}));
jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn(), info: jest.fn() } }));

const rowButton = (provider: string, name: string) =>
    screen
        .getByText(provider)
        .parentElement!.querySelector<HTMLButtonElement>(`button:nth-of-type(${name === '로그인' ? 1 : 2})`)!;

describe('OAuthScreen', () => {
    beforeEach(() => jest.clearAllMocks());

    it('제공자별로 로그인과 로그아웃을 따로 부른다', async () => {
        oAuthLogin.mockResolvedValue({ data: { token: 'x' } });
        oAuthLogout.mockResolvedValue({ data: { success: true } });
        render(<OAuthScreen />);

        await userEvent.click(rowButton('google', '로그인'));
        await userEvent.click(rowButton('apple', '로그아웃'));

        expect(oAuthLogin).toHaveBeenCalledWith('google');
        expect(oAuthLogout).toHaveBeenCalledWith('apple');
    });

    // Apple은 iOS 전용이라 안드로이드에서 실패가 정상 결과다 — 그래서 실패를 그대로 보여준다.
    it('실패를 그대로 적는다', async () => {
        oAuthLogin.mockRejectedValue(new Error('UNSUPPORTED'));
        render(<OAuthScreen />);

        await userEvent.click(rowButton('apple', '로그인'));

        expect(await screen.findByText(/실패: UNSUPPORTED/)).toBeInTheDocument();
    });
});
