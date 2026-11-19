// The site-switch hook lives in @chatic/runtime (socket-driven SDK `auth.switch`), published as
// `runtime.session.useSiteSwitch`. Aliased here so existing apps/web import paths — and the test
// mocks that target THIS path — stay stable.
import { runtime } from '@chatic/runtime';

export const useSiteSwitch = runtime.session.useSiteSwitch;
