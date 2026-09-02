import { Suspense } from 'react';
import { I18nextProvider } from 'react-i18next';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { LoadingFallback } from '@chatic/shared';
import { ThemeProvider } from '@chatic/theme';
import { useSessionAuth } from '@chatic/app-runtime';

import i18n from '../i18n';
import { DesktopRuntime } from './runtime';
import { AppShellSkeleton } from './shared';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: Infinity,
            retry: 1,
        },
    },
});

/**
 * Provider assembly only. Session readiness and the runtime connection (transport bootstrap,
 * socket lifecycle, re-auth) are both owned by `DesktopRuntime` (see `./runtime`) — the app
 * no longer mounts `DataProvider` / `WebSocketV2Connection` / `GlobalChatSync` nor gates the
 * render on `useRelaySessionInit` / `useTokenRefresh`.
 */
export function App() {
    const { isAuthenticated } = useSessionAuth();

    // Authenticated boots land on the chat shell, so show the shell skeleton (not a bare
    // spinner) for better perceived performance; pre-auth keeps the plain loader.
    const bootFallback = isAuthenticated ? <AppShellSkeleton /> : <LoadingFallback />;

    return (
        <I18nextProvider i18n={i18n}>
            <QueryClientProvider client={queryClient}>
                <ThemeProvider>
                    <Suspense fallback={bootFallback}>
                        <DesktopRuntime />
                    </Suspense>
                </ThemeProvider>
            </QueryClientProvider>
        </I18nextProvider>
    );
}

export default App;
