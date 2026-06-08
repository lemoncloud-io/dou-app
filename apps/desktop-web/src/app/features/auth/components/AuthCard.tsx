import type { ReactNode } from 'react';

interface AuthCardProps {
    title: string;
    subtitle: string;
    children: ReactNode;
}

/**
 * Shared auth-screen shell: full-screen ambient brand glow + a centered card
 * with the brand mark, title, and subtitle. The screen body (controls / form)
 * is passed as children. Used by WelcomePage and InviteLoginPage.
 */
export const AuthCard = ({ title, subtitle, children }: AuthCardProps) => (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-background">
        <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
                background:
                    'radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.12), transparent 70%), radial-gradient(40% 40% at 80% 100%, hsl(var(--primary) / 0.08), transparent 70%)',
            }}
            aria-hidden
        />
        <div className="relative flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-border bg-card p-8 shadow-xl shadow-primary/5">
            <div className="flex flex-col gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground shadow-lg shadow-primary/25">
                    C
                </div>
                <div className="flex flex-col gap-1">
                    <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
                    <p className="text-sm text-muted-foreground">{subtitle}</p>
                </div>
            </div>
            {children}
        </div>
    </div>
);
