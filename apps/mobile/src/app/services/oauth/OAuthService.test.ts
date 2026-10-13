import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { appleAuth } from '@invertase/react-native-apple-authentication';

import { OAuthService } from './OAuthService';

jest.mock('@react-native-google-signin/google-signin', () => ({
    GoogleSignin: { configure: jest.fn(), signOut: jest.fn(), signIn: jest.fn(), getTokens: jest.fn() },
}));

jest.mock('@invertase/react-native-apple-authentication', () => ({
    appleAuth: {
        performRequest: jest.fn(),
        getCredentialStateForUser: jest.fn(),
        Operation: { LOGIN: 'LOGIN' },
        Scope: { EMAIL: 'EMAIL', FULL_NAME: 'FULL_NAME' },
        State: { AUTHORIZED: 'AUTHORIZED', REVOKED: 'REVOKED' },
        Error: { CANCELED: 'CANCELED' },
    },
}));

jest.mock('react-native-config', () => ({ __esModule: true, default: { VITE_GOOGLE_WEB_CLIENT_ID: 'web-id' } }));

jest.mock('react-native', () => ({
    Platform: { OS: 'ios' },
}));

const logger = { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() } as never;

describe('OAuthService login', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('resolves null when the user cancels Google sign-in', async () => {
        (GoogleSignin.signIn as jest.Mock).mockResolvedValue({ type: 'cancelled' });
        const service = new OAuthService(logger);

        await expect(service.login('google')).resolves.toBeNull();
    });

    it('throws when Google sign-in fails outright', async () => {
        (GoogleSignin.signIn as jest.Mock).mockRejectedValue(new Error('network down'));
        const service = new OAuthService(logger);

        await expect(service.login('google')).rejects.toThrow('network down');
    });

    it('throws when a Google success carries no idToken', async () => {
        (GoogleSignin.signIn as jest.Mock).mockResolvedValue({ type: 'success', data: { idToken: null } });
        (GoogleSignin.getTokens as jest.Mock).mockResolvedValue({ accessToken: 'at' });
        const service = new OAuthService(logger);

        await expect(service.login('google')).rejects.toThrow(/idToken/);
    });

    it('resolves null when the user cancels Apple sign-in', async () => {
        (appleAuth.performRequest as jest.Mock).mockRejectedValue({ code: 'CANCELED' });
        const service = new OAuthService(logger);

        await expect(service.login('apple')).resolves.toBeNull();
    });

    it('throws when Apple sign-in fails outright', async () => {
        (appleAuth.performRequest as jest.Mock).mockRejectedValue(new Error('sheet failed'));
        const service = new OAuthService(logger);

        await expect(service.login('apple')).rejects.toThrow('sheet failed');
    });

    it('throws when the Apple credential state is not authorized', async () => {
        (appleAuth.performRequest as jest.Mock).mockResolvedValue({ user: 'u1', identityToken: 'tok' });
        (appleAuth.getCredentialStateForUser as jest.Mock).mockResolvedValue('REVOKED');
        const service = new OAuthService(logger);

        await expect(service.login('apple')).rejects.toThrow(/credential state/);
    });

    it('resolves a credential on a clean Google sign-in', async () => {
        (GoogleSignin.signIn as jest.Mock).mockResolvedValue({ type: 'success', data: { idToken: 'id-1' } });
        (GoogleSignin.getTokens as jest.Mock).mockResolvedValue({ accessToken: 'at-1' });
        const service = new OAuthService(logger);

        await expect(service.login('google')).resolves.toMatchObject({ provider: 'google', idToken: 'id-1' });
    });
});
