import {
    PHONE_LOGIN_NOTHING_PENDING,
    PHONE_LOGIN_NO_TOKEN,
    PHONE_LOGIN_SWITCH_FAILED,
    cancelPhoneLogin,
    confirmPhoneLogin,
    retryPhoneLogin,
} from './phoneLogin';

const mockConfirmPhoneCode = jest.fn();
const mockApplySessionToken = jest.fn();

jest.mock('@chatic/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('../session/authRepository', () => ({
    authRepositorySource: { get: () => ({ confirmPhoneCode: (...args: unknown[]) => mockConfirmPhoneCode(...args) }) },
}));
jest.mock('./applySessionToken', () => ({
    applySessionToken: (...args: unknown[]) => mockApplySessionToken(...args),
}));

const TOKEN = { uid: 'main', Token: { identityToken: 'main-identity' }, $auth: { id: 'auth-1' } };
const loggedIn = (overrides: Record<string, unknown> = {}) => ({
    step: 'confirm',
    mode: 'login',
    loggedIn: true,
    isNew: false,
    $token: TOKEN,
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    cancelPhoneLogin();
    mockConfirmPhoneCode.mockResolvedValue(loggedIn());
    mockApplySessionToken.mockResolvedValue(undefined);
});

describe('confirmPhoneLogin', () => {
    it('proves the code in login mode, switches the session to its token, and answers without the token', async () => {
        const result = await confirmPhoneLogin('+821012345678', '123456', { countryCode: 'KR' });

        expect(mockConfirmPhoneCode).toHaveBeenCalledWith('+821012345678', '123456', {
            mode: 'login',
            countryCode: 'KR',
        });
        expect(mockApplySessionToken).toHaveBeenCalledWith(TOKEN);
        expect(result).toEqual({ isNew: false });
        expect(JSON.stringify(result)).not.toContain('identity');
    });

    it('says when the number made a new account', async () => {
        mockConfirmPhoneCode.mockResolvedValue(loggedIn({ isNew: true }));

        await expect(confirmPhoneLogin('+821012345678', '123456')).resolves.toEqual({ isNew: true });
    });

    it('throws what the check throws — a wrong code is the screen to tell', async () => {
        mockConfirmPhoneCode.mockRejectedValue(new Error('403 FORBIDDEN - otp mismatch'));

        await expect(confirmPhoneLogin('+821012345678', '000000')).rejects.toThrow('403 FORBIDDEN');
        expect(mockApplySessionToken).not.toHaveBeenCalled();
    });

    it.each([
        ['no token at all', { $token: undefined }],
        ['a token that signs as nobody', { $token: { Token: {} } }],
    ])('refuses a login confirm that came back with %s', async (_label, answer) => {
        mockConfirmPhoneCode.mockResolvedValue(loggedIn(answer));

        await expect(confirmPhoneLogin('+821012345678', '123456')).rejects.toMatchObject({
            code: PHONE_LOGIN_NO_TOKEN,
        });
        expect(mockApplySessionToken).not.toHaveBeenCalled();
    });

    it('keeps the token when the switch fails, and says the retry is what finishes it', async () => {
        mockApplySessionToken.mockRejectedValueOnce(new Error('relay socket did not adopt the new identity'));

        await expect(confirmPhoneLogin('+821012345678', '123456')).rejects.toMatchObject({
            code: PHONE_LOGIN_SWITCH_FAILED,
        });
        mockApplySessionToken.mockResolvedValueOnce(undefined);
        await expect(retryPhoneLogin()).resolves.toEqual({ isNew: false });
    });
});

describe('retryPhoneLogin', () => {
    it('switches to the kept token again, without proving the spent code', async () => {
        mockConfirmPhoneCode.mockResolvedValue(loggedIn({ isNew: true }));
        mockApplySessionToken.mockRejectedValueOnce(new Error('switch failed'));
        await confirmPhoneLogin('+821012345678', '123456').catch(() => undefined);

        await expect(retryPhoneLogin()).resolves.toEqual({ isNew: true });

        expect(mockConfirmPhoneCode).toHaveBeenCalledTimes(1);
        expect(mockApplySessionToken).toHaveBeenCalledTimes(2);
        expect(mockApplySessionToken).toHaveBeenLastCalledWith(TOKEN);
        // Finished: nothing is left waiting.
        await expect(retryPhoneLogin()).rejects.toMatchObject({ code: PHONE_LOGIN_NOTHING_PENDING });
    });

    it('keeps the token for another retry when the switch fails again', async () => {
        mockApplySessionToken.mockRejectedValue(new Error('switch failed'));
        await confirmPhoneLogin('+821012345678', '123456').catch(() => undefined);

        await expect(retryPhoneLogin()).rejects.toMatchObject({ code: PHONE_LOGIN_SWITCH_FAILED });
        await expect(retryPhoneLogin()).rejects.toMatchObject({ code: PHONE_LOGIN_SWITCH_FAILED });
        expect(mockApplySessionToken).toHaveBeenCalledTimes(3);
    });

    it('says nothing is waiting when no confirmed login is — a new code is the way on', async () => {
        await expect(retryPhoneLogin()).rejects.toMatchObject({ code: PHONE_LOGIN_NOTHING_PENDING });
        expect(mockApplySessionToken).not.toHaveBeenCalled();
    });

    it('does not finish a login a newer confirm replaced', async () => {
        mockApplySessionToken.mockRejectedValueOnce(new Error('switch failed'));
        await confirmPhoneLogin('+821012345678', '123456').catch(() => undefined);
        mockConfirmPhoneCode.mockRejectedValueOnce(new Error('403 FORBIDDEN'));
        await confirmPhoneLogin('+821012345678', '000000').catch(() => undefined);

        await expect(retryPhoneLogin()).rejects.toMatchObject({ code: PHONE_LOGIN_NOTHING_PENDING });
        expect(mockApplySessionToken).toHaveBeenCalledTimes(1);
    });

    it('has nothing to finish once the screen cancelled the waiting login', async () => {
        mockApplySessionToken.mockRejectedValueOnce(new Error('switch failed'));
        await confirmPhoneLogin('+821012345678', '123456').catch(() => undefined);

        cancelPhoneLogin();

        await expect(retryPhoneLogin()).rejects.toMatchObject({ code: PHONE_LOGIN_NOTHING_PENDING });
        expect(mockApplySessionToken).toHaveBeenCalledTimes(1);
    });
});
