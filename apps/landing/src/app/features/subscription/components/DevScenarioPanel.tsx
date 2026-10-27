import { type JSX, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { subscriptionKeys } from '../hooks';
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
