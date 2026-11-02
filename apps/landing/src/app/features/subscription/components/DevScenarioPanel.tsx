import { type JSX, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { subscriptionKeys } from '../hooks';
import { SANDBOX_INTERVALS, type SandboxInterval, type SandboxSetup } from '../lib/createPortSetup';
import {
    DEFAULT_TODAY,
    FAIL_FLAGS,
    type FailFlag,
    MOCK_POLICY,
    SCENARIOS,
    type ScenarioId,
    useMockController,
    useMockState,
} from '../lib/mock';
import { MockPaymentWindow } from './MockPaymentWindow';

import type { PortSetup } from '../lib/createPortSetup';

/**
 * A corner panel for switching the mock's scenario, fail flag and today, and for starting over —
 * the same knobs as `?mock=`, `&fail=` and `&now=`. A developer's tool, so its labels are English and
 * not in the copy files. Shown only with the mock port, which itself only runs where the subscription
 * pages are open; `&panel=0` hides it for screenshots.
 */
export const DevScenarioPanel = (): JSX.Element | null => {
    const controller = useMockController();
    if (!controller) return null;
    return <Panel controller={controller} />;
};

const Panel = ({
    controller,
}: {
    controller: NonNullable<ReturnType<typeof useMockController>>;
}): JSX.Element | null => {
    const state = useMockState(controller);
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);

    if (state.panelHidden) return null;

    // Every cached answer came from the old state; drop them and let the screen ask again.
    const apply = (change: () => void) => {
        change();
        void queryClient.resetQueries({ queryKey: subscriptionKeys.all });
    };

    return (
        <div className="fixed bottom-4 right-4 z-[70] text-xs">
            {open ? (
                <div className="flex w-64 flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-xl">
                    <div className="flex items-center justify-between">
                        <strong className="text-navy">Mock scenario</strong>
                        <button type="button" onClick={() => setOpen(false)} className="text-subtitle hover:text-navy">
                            Close
                        </button>
                    </div>
                    <label className="flex flex-col gap-1">
                        Scenario
                        <select
                            value={state.scenario}
                            onChange={e => apply(() => controller.setScenario(e.target.value as ScenarioId))}
                            className="rounded border border-border px-2 py-1"
                        >
                            {SCENARIOS.map(id => (
                                <option key={id} value={id}>
                                    {id}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        Fail
                        <select
                            value={state.fail ?? ''}
                            onChange={e => apply(() => controller.setFail((e.target.value || null) as FailFlag | null))}
                            className="rounded border border-border px-2 py-1"
                        >
                            <option value="">none</option>
                            {FAIL_FLAGS.map(flag => (
                                <option key={flag} value={flag}>
                                    {flag}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        Today (scenario default {DEFAULT_TODAY})
                        <input
                            type="date"
                            value={state.today}
                            onChange={e => apply(() => controller.setToday(e.target.value || null))}
                            className="rounded border border-border px-2 py-1"
                        />
                    </label>
                    <p className="text-subtitle">
                        Signed in: {state.signedIn ? 'yes' : 'no'} · email code {MOCK_POLICY.emailCode}
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => apply(() => controller.reset())}
                            className="flex-1 rounded bg-navy px-2 py-1.5 text-white"
                        >
                            Reset
                        </button>
                        <button
                            type="button"
                            onClick={() => controller.setPanelHidden(true)}
                            className="flex-1 rounded border border-border px-2 py-1.5"
                        >
                            Hide
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="rounded-full bg-navy px-3 py-1.5 font-mono text-white shadow-lg"
                >
                    mock: {state.scenario}
                    {state.fail ? ` · ${state.fail}` : ''}
                </button>
            )}
        </div>
    );
};

/**
 * The developer tools a port brings, mounted once at the route root: with the mock, its stand-in card
 * window and scenario panel; with the server, the sandbox payments panel, and while sandbox payments
 * are on, their banner and the same stand-in card window. Neither exists where the account surface is
 * shut, since only the catalog port runs there.
 */
export const DevTools = ({ setup }: { setup: Pick<PortSetup, 'mock' | 'sandbox'> }): JSX.Element | null => {
    if (setup.mock) {
        return (
            <>
                <MockPaymentWindow />
                <DevScenarioPanel />
            </>
        );
    }
    if (!setup.sandbox) return null;
    return (
        <>
            {setup.sandbox.enabled && <SandboxBanner />}
            {setup.sandbox.window && <MockPaymentWindow host={setup.sandbox.window} />}
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
 * for screenshots, as it does the mock's.
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
