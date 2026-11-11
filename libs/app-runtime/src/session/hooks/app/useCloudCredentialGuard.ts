import { useCallback, useEffect, useState } from 'react';

import { CloudCredentialGuard } from '@chatic/runtime-core';
import type { CloudCredentialPolicy } from '@chatic/runtime-core';

export type { CloudCredentialPolicy } from '@chatic/runtime-core';

/**
 * Keeps every cloud socket session alive — runtime-core's `CloudCredentialGuard`, started for as long
 * as the calling component is mounted. Which clouds, when it renews and why it never tears a cloud down
 * are documented there; this hook only starts it, re-arms it when the policy changes, and hands back a
 * stable `check` for a trigger the guard cannot know about (apps/web fires it on WebView foreground).
 *
 * A change to any policy field restarts the guard, which evaluates every cloud at once on start.
 */
export const useCloudCredentialGuard = (policy: CloudCredentialPolicy = {}): { check: () => Promise<void> } => {
    const [guard] = useState(() => new CloudCredentialGuard(policy));
    // The committed policy — in an effect, so a render React throws away leaves nothing behind.
    // Declared before the start effect, which therefore starts with it.
    useEffect(() => guard.setPolicy(policy));

    const { enabled, marginMs, checkOnVisible } = policy;
    useEffect(() => guard.start(), [guard, enabled, marginMs, checkOnVisible]);

    const check = useCallback(() => guard.check(), [guard]);
    return { check };
};
