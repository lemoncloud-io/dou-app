import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RuntimeConnectionHost, useRuntimeBinding } from '@chatic/app-runtime';
import { BrowserRouter } from 'react-router-dom';
import { Routes } from './routes';
import { useSocketDelegate } from './hooks/useSocketDelegate';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: Infinity,
            retry: 1,
        },
    },
});

function AppInner() {
    const binding = useRuntimeBinding();
    const delegate = useSocketDelegate();

    return (
        <RuntimeConnectionHost binding={binding} delegate={delegate}>
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
