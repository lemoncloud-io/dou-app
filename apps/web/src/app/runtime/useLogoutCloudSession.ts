// The cloud-logout hook lives in @chatic/runtime (best-effort cloud-socket logout + store
// clear), published as `runtime.session.useLogoutCloudSession`. Aliased here so existing apps/web
// import paths — and the test mocks that target THIS path — stay stable.
import { runtime } from '@chatic/runtime';

export const useLogoutCloudSession = runtime.session.useLogoutCloudSession;
