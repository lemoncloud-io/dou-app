import { runtime } from '@chatic/runtime';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

export const fetchInviteCodeInfo = (code: string, backend: string): Promise<MyInviteView> =>
    runtime.session.fetchInviteInfoWithCode(code, backend);
