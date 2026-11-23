import * as ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';

import { ErrorFallback } from '@chatic/shared';

import i18n from '../../i18n';
import { bootSplash } from './bootSplash';

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
