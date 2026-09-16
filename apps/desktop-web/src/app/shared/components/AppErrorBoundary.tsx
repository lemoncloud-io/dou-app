import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { Button } from '@chatic/ui-kit/components/ui/button';

/**
 * Last line of defence around the whole app.
 *
 * Without one, two ordinary failures ended the session at a blank window with no
 * way out: a render that throws, and — more often in the installed shell — a lazy
 * route chunk that 404s because the build it belongs to was replaced while the
 * app was open. Both are recoverable by reloading; neither said so.
 *
 * A class component because React offers no hook equivalent of
 * `componentDidCatch`.
 */
const ErrorScreen = ({ onReload }: { onReload: () => void }) => {
    const { t } = useTranslation();
    return (
        <div className="flex h-screen items-center justify-center bg-background p-8">
            <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-card p-8">
                <div className="flex flex-col gap-1">
                    <h1 className="text-title text-foreground">{t('error.boundary.title')}</h1>
                    <p className="text-callout text-muted-foreground">{t('error.boundary.body')}</p>
                </div>
                <Button onClick={onReload}>{t('error.boundary.reload')}</Button>
            </div>
        </div>
    );
};

interface AppErrorBoundaryProps {
    children: ReactNode;
}

interface AppErrorBoundaryState {
    hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
    override state: AppErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(): AppErrorBoundaryState {
        return { hasError: true };
    }

    override componentDidCatch(error: Error, info: ErrorInfo): void {
        logger.error('APP', '[AppErrorBoundary] render failed', { error, componentStack: info.componentStack });
    }

    override render(): ReactNode {
        if (!this.state.hasError) return this.props.children;
        // A full reload, not a state reset: the common cause is a stale chunk, and
        // re-rendering the same broken tree would land right back here.
        return <ErrorScreen onReload={() => window.location.reload()} />;
    }
}
