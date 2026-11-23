import { useCallback, useEffect, useState } from 'react';

import type { CloudCredentialPolicy } from '@chatic/runtime-client';

import { runtimeEngine } from '@chatic/runtime-client';

export type { CloudCredentialPolicy } from '@chatic/runtime-client';

export const useCloudCredentialGuard = (policy: CloudCredentialPolicy = {}): { check: () => Promise<void> } => {
    const [guard] = useState(() => runtimeEngine().cloudCredentialGuard(policy));
    useEffect(() => guard.setPolicy(policy));

    const { enabled, marginMs, checkOnVisible } = policy;
    useEffect(() => guard.start(), [guard, enabled, marginMs, checkOnVisible]);

    const check = useCallback(() => guard.check(), [guard]);
    return { check };
};
