import { GoogleSignIn } from './googleSignIn';

/** A window with GIS already loaded, whose button "click" is the test calling the callback. */
const fakeGoogleWindow = () => {
    let callback: ((response: { credential?: string }) => void) | null = null;
    const disableAutoSelect = vi.fn();
    const win = {
        document,
        google: {
            accounts: {
                id: {
                    initialize: (options: { callback: typeof callback }) => {
                        callback = options.callback;
                    },
                    renderButton: vi.fn(),
                    disableAutoSelect,
                },
            },
        },
    } as unknown as Window;
    return { win, signInWith: (credential?: string) => callback?.({ credential }), disableAutoSelect };
};

describe('GoogleSignIn', () => {
    it('opens the sheet and answers with the ID token GIS hands back', async () => {
        const { win, signInWith } = fakeGoogleWindow();
        const signIn = new GoogleSignIn('client', () => 'android', win);

        const pending = signIn.signInWithGoogle();
        expect(signIn.state.open).toBe(true);
        await signIn.renderButton(document.createElement('div'));
        signInWith('eyJ.token');

        await expect(pending).resolves.toEqual({ provider: 'google', platform: 'android', idToken: 'eyJ.token' });
        expect(signIn.state.open).toBe(false);
    });

    it('answers a cancelled sheet with no result', async () => {
        const { win } = fakeGoogleWindow();
        const signIn = new GoogleSignIn('client', () => 'ios', win);

        const pending = signIn.signInWithGoogle();
        signIn.cancel();

        await expect(pending).resolves.toBeNull();
    });

    it('says why it cannot sign in without a client, and still lets the sheet be cancelled', async () => {
        const { win } = fakeGoogleWindow();
        const signIn = new GoogleSignIn('', () => 'ios', win);

        const pending = signIn.signInWithGoogle();
        expect(signIn.state.problem).toBe('no-client');
        signIn.cancel();

        await expect(pending).resolves.toBeNull();
    });

    it('turns automatic account selection off on sign-out', () => {
        const { win, disableAutoSelect } = fakeGoogleWindow();

        new GoogleSignIn('client', () => 'ios', win).signOut();

        expect(disableAutoSelect).toHaveBeenCalled();
    });
});
