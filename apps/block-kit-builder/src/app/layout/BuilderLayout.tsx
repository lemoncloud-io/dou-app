import { useState, type CSSProperties, type ReactNode } from 'react';

import { Toaster } from 'sonner';

import { cn } from '@chatic/ui-kit';
import { useTheme } from '@chatic/theme';

import { PaneDivider } from './PaneDivider';
import { SendToDou } from './SendToDou';
import { ThemeToggle } from './ThemeToggle';
import { PANE_LIMITS, usePaneSizes } from './usePaneSizes';

interface BuilderLayoutProps {
    rail: ReactNode;
    preview: ReactNode;
    previewActions?: ReactNode;
    payload: ReactNode;
    payloadActions?: ReactNode;
}

const PANE_HEADING = 'px-4 py-3 text-caption font-medium text-muted-foreground';

type PaneId = 'compose' | 'message' | 'payload';

const PANES: { id: PaneId; title: string }[] = [
    { id: 'compose', title: 'Compose' },
    { id: 'message', title: 'Message' },
    { id: 'payload', title: 'Payload' },
];

interface PaneProps {
    title: string;
    label?: string;
    children: ReactNode;
    className?: string;
    actions?: ReactNode;
    shown: boolean;
    style?: CSSProperties;
}

const Pane = ({ title, label, children, className, actions, shown, style }: PaneProps) => (
    <section
        aria-label={label ?? title}
        style={style}
        className={cn('min-w-0 flex-col overflow-hidden', shown ? 'flex' : 'hidden lg:flex', className)}
    >
        <div className="hidden shrink-0 items-center justify-between gap-2 border-b border-hairline pr-3 lg:flex">
            <h2 className={PANE_HEADING}>{title}</h2>
            {actions}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
);

export const BuilderLayout = ({ rail, preview, previewActions, payload, payloadActions }: BuilderLayoutProps) => {
    const [active, setActive] = useState<PaneId>('compose');
    const { sizes, setSize } = usePaneSizes();
    const { isDarkTheme } = useTheme();

    return (
        <div className="flex h-[100dvh] flex-col bg-background text-foreground">
            <Toaster theme={isDarkTheme ? 'dark' : 'light'} position="bottom-right" />
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline py-1.5 pl-4 pr-2 lg:h-14 lg:px-5">
                <span className="flex items-center gap-2">
                    <img src="/dou-mark.png" alt="" className="h-6 w-auto shrink-0 lg:h-8" />
                    <span className="text-heading lg:text-[1.0625rem] lg:leading-6">
                        <span className="text-primary-ink">DoU</span> Block Kit Builder
                    </span>
                </span>
                <span className="flex items-center gap-1 lg:gap-3">
                    <ThemeToggle />
                    <SendToDou />
                </span>
            </header>

            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline pr-2 lg:hidden">
                <div role="tablist" aria-label="Builder panes" className="flex">
                    {PANES.map(pane => (
                        <button
                            key={pane.id}
                            type="button"
                            role="tab"
                            aria-selected={active === pane.id}
                            onClick={() => setActive(pane.id)}
                            className={cn(
                                'focus-ring -mb-px border-b-2 px-4 py-2.5 text-caption transition-colors ease-tactile',
                                active === pane.id
                                    ? 'border-primary font-semibold text-foreground'
                                    : 'border-transparent text-muted-foreground'
                            )}
                        >
                            {pane.title}
                        </button>
                    ))}
                </div>
                {previewActions}
            </div>

            <div className="flex min-h-0 flex-1">
                <Pane
                    title="Template"
                    label="Compose"
                    shown={active === 'compose'}
                    style={{ ['--pane-w' as string]: `${sizes.rail}px` }}
                    className="w-full shrink-0 bg-well lg:w-[var(--pane-w)]"
                >
                    {rail}
                </Pane>
                <PaneDivider
                    value={sizes.rail}
                    onValue={value => setSize('rail', value)}
                    direction={1}
                    label="the compose pane"
                    {...PANE_LIMITS.rail}
                />
                <Pane
                    title="Message Preview"
                    label="Message"
                    shown={active === 'message'}
                    className="w-full bg-well lg:w-auto lg:flex-1"
                    actions={previewActions}
                >
                    {preview}
                </Pane>
                <PaneDivider
                    value={sizes.payload}
                    onValue={value => setSize('payload', value)}
                    direction={-1}
                    label="the payload pane"
                    {...PANE_LIMITS.payload}
                />
                <Pane
                    title="Payload"
                    shown={active === 'payload'}
                    actions={payloadActions}
                    style={{ ['--pane-w' as string]: `${sizes.payload}px` }}
                    className="w-full shrink-0 bg-well lg:w-[var(--pane-w)]"
                >
                    {payload}
                </Pane>
            </div>
        </div>
    );
};
