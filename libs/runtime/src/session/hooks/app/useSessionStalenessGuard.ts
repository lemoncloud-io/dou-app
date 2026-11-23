import { useCallback, useEffect, useState } from 'react';

import type { SessionStalenessPolicy } from '@chatic/runtime-client';

import { runtimeEngine } from '@chatic/runtime-client';

export type { SessionStalenessPolicy } from '@chatic/runtime-client';

export const useSessionStalenessGuard = (policy: SessionStalenessPolicy = {}): { check: () => Promise<void> } => {
    const [guard] = useState(() => runtimeEngine().relayCredentialGuard(policy));
    useEffect(() => guard.setPolicy(policy));

    const { enabled, intervalMs, checkOnVisible, checkOnRelayVerified } = policy;
    useEffect(() => guard.start(), [guard, enabled, intervalMs, checkOnVisible, checkOnRelayVerified]);

    const check = useCallback(() => guard.check(), [guard]);
    return { check };
};
