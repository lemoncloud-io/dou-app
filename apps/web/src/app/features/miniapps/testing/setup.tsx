import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { DomainMiniApp } from '@chatic/runtime';

import type { ReactElement } from 'react';

/** A mini app as the relay lists it, active unless said otherwise. */
export const miniApp = (id: string, over: Partial<DomainMiniApp> = {}): DomainMiniApp => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    url: `https://${id}.example/`,
    enabled: true,
    status: 'active',
    ...over,
});

/** Where the router is now, for a test to read after a redirect. */
const Where = () => <output data-testid="where">{useLocation().pathname}</output>;

/**
 * Renders `element` at `path` under a fresh query client, with a marker of the current location. The
 * element is mounted on `route` (every path by default); anything else the router lands on is empty.
 */
export const renderAt = (
    element: ReactElement,
    path: string,
    { route = '*', state }: { route?: string; state?: unknown } = {}
): RenderResult & { client: QueryClient; rerenderWith: (node: ReactElement) => void } => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const tree = (node: ReactElement) => (
        <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={[{ pathname: path, state }]}>
                <Routes>
                    <Route path={route} element={node} />
                    {route !== '*' && <Route path="*" element={null} />}
                </Routes>
                <Where />
            </MemoryRouter>
        </QueryClientProvider>
    );
    const result = render(tree(element));
    return { ...result, client, rerenderWith: (node: ReactElement) => result.rerender(tree(node)) };
};
