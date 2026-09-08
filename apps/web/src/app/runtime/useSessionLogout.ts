// The relay-logout hook lives in @chatic/app-runtime (best-effort socket logout + store teardown),
// published as `runtime.session.useSessionLogout`. Aliased here so existing apps/web import paths —
// and the test mocks that target THIS path — stay stable.
import { runtime } from '@chatic/app-runtime';

export const useSessionLogout = runtime.session.useSessionLogout;
