import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { ChevronLeft } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';

interface PageShellProps {
    /** The page title, drawn in the header. */
    title: ReactNode;
    /** Where back goes, e.g. `/settings` for the Account hub. */
    backTo: string;
    /** The parent's name, e.g. the Settings title — the back button names its target. */
    backLabel: string;
    /** Trailing header content, e.g. the Settings autosave note. */
    actions?: ReactNode;
    /** Extra classes for the scroll body, e.g. section spacing. */
    contentClassName?: string;
    children: ReactNode;
}

/**
 * The shared shell for the me-pages (Profile, Settings, Account and its
 * sub-pages). Every page used to hand-roll the same header with its own back
 * target — back went home from Profile, Settings and Account, but to the
 * parent on sub-pages — and none of them drew a `<main>` landmark.
 */
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
                className={
                    contentClassName
                        ? `scrollbar-thin mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-8 ${contentClassName}`
                        : 'scrollbar-thin mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-8'
                }
            >
                {children}
            </main>
        </div>
    );
};
