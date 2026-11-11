import { useCallback, useEffect, useState } from 'react';

import { RelayCredentialGuard } from '@chatic/runtime-core';
import type { SessionStalenessPolicy } from '@chatic/runtime-core';

export type { SessionStalenessPolicy } from '@chatic/runtime-core';

/**
 * Keeps the relay HTTP signing credentials fresh — runtime-core's `RelayCredentialGuard`, started for
 * as long as the calling component is mounted. The probe, the triggers and why the guard never ends a
 * session are documented there; this hook only starts it, re-arms it when the policy's triggers change,
 * and hands back a stable `check` for a trigger the guard cannot know about (apps/web fires it on
 * WebView foreground, which is a bridge concept).
 *
 * A change to any of the trigger fields re-arms all of them (the interval starts over). No app changes
 * them at runtime but `enabled`.
 */
export const useSessionStalenessGuard = (policy: SessionStalenessPolicy = {}): { check: () => Promise<void> } => {
    const [guard] = useState(() => new RelayCredentialGuard(policy));
    // The committed policy, for the next probe — in an effect, so a render React throws away leaves
    // nothing behind. Declared before the start effect, which therefore starts with it.
    useEffect(() => guard.setPolicy(policy));

    const { enabled, intervalMs, checkOnVisible, checkOnRelayVerified } = policy;
    useEffect(() => guard.start(), [guard, enabled, intervalMs, checkOnVisible, checkOnRelayVerified]);

    const check = useCallback(() => guard.check(), [guard]);
    return { check };
};
