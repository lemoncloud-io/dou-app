import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RuntimeConnectionHost, useRuntimeBinding, useSocketState } from '@chatic/app-runtime';
import { BrowserRouter } from 'react-router-dom';
import { Routes } from './routes';
import { metricsCollector } from './metrics/MetricsCollector';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: Infinity,
            retry: 1,
        },
    },
});

// Always-on socket quality reporter — keeps connect/disconnect counts accurate
// even while the monitoring overlay is closed.
function MetricsSocketReporter() {
    const socketState = useSocketState();
    useEffect(() => {
        metricsCollector.reportSocketState(socketState.state);
    }, [socketState.state]);
    return null;
}

function AppInner() {
    const binding = useRuntimeBinding();

    return (
        <RuntimeConnectionHost binding={binding}>
            <MetricsSocketReporter />
            <BrowserRouter>
                <Routes />
            </BrowserRouter>
        </RuntimeConnectionHost>
    );
}

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <AppInner />
        </QueryClientProvider>
    );
}
