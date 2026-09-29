import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OAuthScreen } from './OAuthScreen';
import { setDebugLanguageForTests } from '../../i18n';

const oAuthLogin = jest.fn();
const oAuthLogout = jest.fn();

jest.mock('../../../../bridge', () => ({
    appBridge: { oAuthLogin: (p: string) => oAuthLogin(p), oAuthLogout: (p: string) => oAuthLogout(p) },
}));
jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn(), info: jest.fn() } }));

const rowButton = (provider: string, name: string) =>
    screen
        .getByText(provider)
        .parentElement!.querySelector<HTMLButtonElement>(`button:nth-of-type(${name === 'login' ? 1 : 2})`)!;

describe('OAuthScreen', () => {
    let restoreLanguage: () => void;

    beforeEach(() => {
        jest.clearAllMocks();
        restoreLanguage = setDebugLanguageForTests('en');
    });
    afterEach(() => restoreLanguage());

    it('제공자별로 로그인과 로그아웃을 따로 부른다', async () => {
        oAuthLogin.mockResolvedValue({ data: { token: 'x' } });
        oAuthLogout.mockResolvedValue({ data: { success: true } });
        render(<OAuthScreen />);

        await userEvent.click(rowButton('google', 'login'));
        await userEvent.click(rowButton('apple', 'logout'));

        expect(oAuthLogin).toHaveBeenCalledWith('google');
        expect(oAuthLogout).toHaveBeenCalledWith('apple');
    });

    // Apple is iOS-only, so failing on Android is the expected outcome — hence we show the failure as-is.
    it('실패를 그대로 적는다', async () => {
        oAuthLogin.mockRejectedValue(new Error('UNSUPPORTED'));
        render(<OAuthScreen />);

        await userEvent.click(rowButton('apple', 'login'));

        expect(await screen.findByText(/failed: UNSUPPORTED/)).toBeInTheDocument();
    });
});
