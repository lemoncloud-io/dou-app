import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { ChevronLeft } from 'lucide-react';

import { cn, Button } from '@chatic/ui-kit';

interface PageShellProps {
    title: ReactNode;
    backTo: string;
    backLabel: string;
    actions?: ReactNode;
    contentClassName?: string;
    children: ReactNode;
}

export const PageShell = ({ title, backTo, backLabel, actions, contentClassName, children }: PageShellProps) => {
    const navigate = useNavigate();

    return (
        <div className="flex h-full flex-col bg-background">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
                <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-muted-foreground"
                    onClick={() => navigate(backTo)}
                >
                    <ChevronLeft className="h-4 w-4" />
                    {backLabel}
                </Button>
                <h1 className="min-w-0 flex-1 truncate text-heading text-foreground">{title}</h1>
                {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
            </header>

            <main
                className={cn(
                    'scrollbar-thin relative mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-8',
                    contentClassName
                )}
            >
                {children}
            </main>
        </div>
    );
};
