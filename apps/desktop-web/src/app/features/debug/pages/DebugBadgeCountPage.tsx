import { useState } from 'react';

import { isNative, webClient } from '@chatic/bridges';
import { Button } from '@chatic/ui-kit/components/ui/button';

const nowLabel = (): string => new Date().toLocaleTimeString();

/** Dev-only OS badge tester — drives the shell's SetBadgeCount handler. */
export const DebugBadgeCountPage = () => {
    const [count, setCount] = useState('5');
    const [log, setLog] = useState<string[]>([]);
    const native = isNative();

    const push = (message: string) => setLog(prev => [`[${nowLabel()}] ${message}`, ...prev].slice(0, 30));

    const setBadge = async (value: number) => {
        if (!native) {
            push('not running in the desktop shell — no-op');
            return;
        }
        try {
            const res = await webClient.request('SetBadgeCount', { count: value });

            push(`SetBadgeCount(${value}) → ${JSON.stringify((res as any)?.data ?? res)}`);
        } catch (error) {
            push(`error: ${String(error)}`);
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-8">
            <h1 className="text-base font-semibold text-foreground">OS badge</h1>
            <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
                desktop shell: {native ? 'yes' : 'no (badge is a no-op in browser)'}
            </div>

            <div className="flex items-center gap-2">
                <input
                    value={count}
                    onChange={e => setCount(e.target.value)}
                    inputMode="numeric"
                    className="h-10 w-24 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-focus-border"
                />
                <Button size="sm" onClick={() => void setBadge(Math.max(0, Number(count) || 0))}>
                    Set badge
                </Button>
                <Button variant="outline" size="sm" onClick={() => void setBadge(0)}>
                    Clear
                </Button>
            </div>

            <ul className="scrollbar-thin max-h-80 overflow-y-auto rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                {log.map((line, index) => (
                    <li key={`${line}-${index}`}>{line}</li>
                ))}
            </ul>
        </div>
    );
};
