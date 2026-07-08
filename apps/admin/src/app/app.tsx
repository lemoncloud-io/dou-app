import { Suspense } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import { LoadingFallback } from '@chatic/shared';
import { ThemeProvider } from '@chatic/theme';

import { Router } from './routes';
import i18n from '../i18n';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: Infinity,
            retry: 1,
        },
    },
});

export function App() {
    return (
        <I18nextProvider i18n={i18n}>
            <Suspense fallback={<LoadingFallback />}>
                <HelmetProvider>
                    <QueryClientProvider client={queryClient}>
                        <ThemeProvider>
                            <Router />
                            <Toaster />
                        </ThemeProvider>
                    </QueryClientProvider>
                </HelmetProvider>
            </Suspense>
        </I18nextProvider>
    );
}

export default App;
