import { Suspense } from 'react';
import { I18nextProvider } from 'react-i18next';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ThemeProvider } from '@chatic/theme';
import { runtime } from '@chatic/runtime';

import i18n from '../i18n';
import { DesktopRuntime } from './runtime';
import { AppErrorBoundary, RouteFallback } from './shared';
import { deviceStore } from './storage';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: Infinity,
            retry: 1,
        },
    },
});

export function App() {
    const { isAuthenticated } = runtime.session.useSessionAuth();

    const bootFallback = <RouteFallback pathname={window.location.pathname} isAuthenticated={isAuthenticated} />;

    return (
        <I18nextProvider i18n={i18n}>
            <QueryClientProvider client={queryClient}>
                <ThemeProvider defaultTheme="system" storage={deviceStore}>
                    <AppErrorBoundary>
                        <Suspense fallback={bootFallback}>
                            <DesktopRuntime />
                        </Suspense>
                    </AppErrorBoundary>
                </ThemeProvider>
            </QueryClientProvider>
        </I18nextProvider>
    );
}

export default App;
