import { fetchInviteInfoWithCode } from '@chatic/app-runtime';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

/**
 * Non-consuming invite-code lookup (no expiry/consume stamp).
 * GET <backend>/hello/invite-code?code=<code>
 * Used to resolve $envs.wss / cloudId / siteId for the target deployment.
 *
 * v2: delegates to web-core's `fetchInviteInfoWithCode` (the same signed GET, now
 * shipped in the lib). Kept as a feature-local wrapper so call sites stay stable.
 */
export const fetchInviteCodeInfo = (code: string, backend: string): Promise<MyInviteView> =>
    fetchInviteInfoWithCode(code, backend);
