import { RouterProvider, createBrowserRouter } from 'react-router-dom';

export const Router = () => {
    const router = createBrowserRouter([
        {
            path: '/',
            element: (
                <main className="min-h-screen bg-background text-foreground">
                    <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-8">
                        <section className="w-full rounded-2xl border border-border bg-card p-8 shadow-sm">
                            <h1 className="text-2xl font-semibold">Admin Disabled</h1>
                            <p className="mt-3 text-sm text-muted-foreground">
                                This admin module is currently not in use. The build keeps a minimal placeholder route
                                so deployment can complete safely.
                            </p>
                        </section>
                    </div>
                </main>
            ),
        },
        {
            path: '*',
            element: null,
        },
    ]);

    return <RouterProvider router={router} />;
};
