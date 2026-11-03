import { type JSX, useState } from 'react';

import { SANDBOX_INTERVALS, type SandboxInterval, type SandboxSetup } from '../lib/createPortSetup';

import type { PortSetup } from '../lib/createPortSetup';

/**
 * The developer tools of a server tab, mounted once at the route root: the sandbox payments panel, and
 * while sandbox payments are on, their banner. None exist where the account surface is shut, since
 * only the catalog port runs there.
 */
export const DevTools = ({ setup }: { setup: Pick<PortSetup, 'sandbox'> }): JSX.Element | null => {
    if (!setup.sandbox) return null;
    return (
        <>
            {setup.sandbox.enabled && <SandboxBanner />}
            <SandboxPanel sandbox={setup.sandbox} />
        </>
    );
};

/** Over everything, so no screen of a sandboxed tab is taken for a real payment. */
const SandboxBanner = (): JSX.Element => (
    <div
        role="status"
        className="pointer-events-none fixed inset-x-0 top-0 z-[80] bg-status-warning py-1 text-center text-xs font-semibold text-ink"
    >
        Sandbox payments — no real charge
    </div>
);

const INTERVAL_LABELS: Record<SandboxInterval, string> = {
    '': 'A month (the product)',
    '10m': '10 minutes',
    '1h': '1 hour',
    '1d': '1 day',
};

/**
 * The corner panel of a server tab: sandbox payments on or off (the page reloads, as `?sandbox=1` and
 * `?sandbox=0` would), and the renewal period the next sandboxed start asks for. `?panel=0` hides it
 * for screenshots.
 */
const SandboxPanel = ({ sandbox }: { sandbox: SandboxSetup }): JSX.Element | null => {
    const [open, setOpen] = useState(false);
    const [interval, setChosen] = useState<SandboxInterval>(() => sandbox.interval());
    const [hidden] = useState(() => {
        try {
            return new URLSearchParams(window.location.search).get('panel') === '0';
        } catch {
            return false;
        }
    });
    if (hidden) return null;

    return (
        <div className="fixed bottom-4 right-4 z-[70] text-xs">
            {open ? (
                <div className="flex w-64 flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-xl">
                    <div className="flex items-center justify-between">
                        <strong className="text-navy">Payments</strong>
                        <button type="button" onClick={() => setOpen(false)} className="text-subtitle hover:text-navy">
                            Close
                        </button>
                    </div>
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={sandbox.enabled}
                            onChange={e => sandbox.turn(e.target.checked)}
                        />
                        Sandbox payments (no real charge)
                    </label>
                    <label className="flex flex-col gap-1">
                        Renewal period of the next start
                        <select
                            value={interval}
                            disabled={!sandbox.enabled}
                            onChange={e => {
                                const next = e.target.value as SandboxInterval;
                                setChosen(next);
                                sandbox.setInterval(next);
                            }}
                            className="rounded border border-border px-2 py-1"
                        >
                            {SANDBOX_INTERVALS.map(value => (
                                <option key={value} value={value}>
                                    {INTERVAL_LABELS[value]}
                                </option>
                            ))}
                        </select>
                    </label>
                    <p className="text-subtitle">
                        Runs the server&apos;s subscription on the payment server&apos;s mock provider. A trial already
                        used by the account stays used.
                    </p>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="rounded-full bg-navy px-3 py-1.5 font-mono text-white shadow-lg"
                >
                    payments: {sandbox.enabled ? `sandbox${interval ? ` · ${interval}` : ''}` : 'real'}
                </button>
            )}
        </div>
    );
};
