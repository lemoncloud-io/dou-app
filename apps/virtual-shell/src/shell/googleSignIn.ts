import type { GoogleOAuthTokenResult } from '@chatic/app-messages';
import type { ShellPlatform } from '@chatic/fake-shell';

import type { SignInDriver } from './shellHandlers';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

interface GoogleIdentity {
    accounts: {
        id: {
            initialize(options: {
                client_id: string;
                callback: (response: { credential?: string }) => void;
                ux_mode: 'popup';
                auto_select: boolean;
            }): void;
            renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
            disableAutoSelect(): void;
        };
    };
}

type GoogleWindow = Window & { google?: GoogleIdentity };

export interface SignInSheetState {
    open: boolean;
    /** Why the sheet cannot sign in, when it cannot: no client configured, or GIS did not load. */
    problem: 'no-client' | 'load-failed' | null;
}

/**
 * Google sign-in, standing in for the app's native Google Sign-In sheet.
 *
 * The app gets an ID token from the native SDK; this gets the same token from Google Identity
 * Services in a popup, for the same client (`VITE_GOOGLE_WEB_CLIENT_ID`, the one the native SDK is
 * configured with), so the token's audience is the same and the server verifies it the same way.
 *
 * The popup opens only from a click on the button GIS draws itself (`renderButton`): GIS has no call
 * that opens an ID-token popup from an element of ours, and a popup opened in answer to a bridge
 * message — not a click in this page — would be blocked anyway. Hence a sheet with that button and a
 * cancel. GIS does not report a popup closed without signing in, so the sheet stays until the person
 * signs in or cancels.
 */
export class GoogleSignIn implements SignInDriver {
    private sheet: SignInSheetState = { open: false, problem: null };
    private pending: ((result: GoogleOAuthTokenResult | null) => void) | null = null;
    private loading: Promise<GoogleIdentity> | null = null;
    private readonly listeners = new Set<() => void>();

    constructor(
        private readonly clientId: string,
        private readonly platform: () => ShellPlatform,
        private readonly win: GoogleWindow = window
    ) {}

    get state(): SignInSheetState {
        return this.sheet;
    }

    onChange(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    signInWithGoogle(): Promise<GoogleOAuthTokenResult | null> {
        // A second request while the sheet is up replaces the first, which is answered as cancelled.
        this.pending?.(null);
        this.set({
            open: true,
            problem: this.clientId ? null : 'no-client',
        });
        return new Promise(resolve => {
            this.pending = resolve;
        });
    }

    /** The sheet mounts the GIS button into `parent` once it is on screen. */
    async renderButton(parent: HTMLElement): Promise<void> {
        if (!this.clientId) return;
        try {
            const google = await this.load();
            google.accounts.id.initialize({
                client_id: this.clientId,
                callback: response => this.finish(response.credential ?? null),
                ux_mode: 'popup',
                auto_select: false,
            });
            google.accounts.id.renderButton(parent, {
                type: 'standard',
                theme: 'outline',
                size: 'large',
                text: 'signin_with',
            });
        } catch {
            this.set({ open: true, problem: 'load-failed' });
        }
    }

    /** The person closed the sheet: the app answers a cancelled sign-in with no result. */
    cancel(): void {
        this.finish(null);
    }

    signOut(): void {
        this.win.google?.accounts.id.disableAutoSelect();
    }

    private finish(idToken: string | null): void {
        const resolve = this.pending;
        this.pending = null;
        this.set({ open: false, problem: null });
        resolve?.(idToken ? { provider: 'google', platform: this.platform(), idToken } : null);
    }

    private load(): Promise<GoogleIdentity> {
        if (this.win.google?.accounts?.id) return Promise.resolve(this.win.google);
        this.loading ??= new Promise((resolve, reject) => {
            const script = this.win.document.createElement('script');
            script.src = GIS_SRC;
            script.async = true;
            script.onload = () => (this.win.google ? resolve(this.win.google) : reject(new Error('GIS missing')));
            script.onerror = () => {
                this.loading = null;
                reject(new Error('GIS failed to load'));
            };
            this.win.document.head.appendChild(script);
        });
        return this.loading;
    }

    private set(state: SignInSheetState): void {
        this.sheet = state;
        for (const listener of [...this.listeners]) listener();
    }
}
