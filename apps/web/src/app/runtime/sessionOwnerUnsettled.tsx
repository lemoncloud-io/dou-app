import * as ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';

import { ErrorFallback } from '@chatic/shared';

import i18n from '../../i18n';
import { bootSplash } from './bootSplash';

/**
 * The screen for a launch whose session owner could not be settled: the phone shell offered to hold
 * the session, then never answered whether it does. The page boots no runtime — the shell may hold
 * the session, and a page that ran its own would be a second owner — so all it can offer is to start
 * over, which asks the shell again from a fresh page.
 *
 * It starts over by itself when the app comes back to the foreground: a shell that could not answer
 * while the device was locked, or while the app was away, may answer now.
 *
 * Rendered in place of the app, with only translations around it, since nothing else has booted.
 */
export const showSessionOwnerUnsettled = (
    failure: { attempts: number; lastFailure: string },
    reload: () => void = () => window.location.reload()
): void => {
    const error = new Error(
        `The app did not say who holds the session (${failure.lastFailure} after ${failure.attempts} attempts)`
    );
    ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
        <I18nextProvider i18n={i18n}>
            <ErrorFallback error={error} errorType="unknown" resetErrorBoundary={reload} />
        </I18nextProvider>
    );
    bootSplash.release('error');

    let wasHidden = document.visibilityState === 'hidden';
    const onVisibilityChange = (): void => {
        if (document.visibilityState === 'hidden') {
            wasHidden = true;
            return;
        }
        if (!wasHidden) return;
        document.removeEventListener('visibilitychange', onVisibilityChange);
        reload();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
};
