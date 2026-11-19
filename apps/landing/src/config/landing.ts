import { runtime } from '@chatic/runtime';
import {
    authLocation,
    defineRuntime,
    foregroundVisibility,
    startRuntime,
    transportBrowser,
    webHostFacts,
} from '@chatic/runtime-web';

import { cacheLandingWebStorage, storageLandingTab } from './adapters';
import { landingConfigPorts } from './adapters/config';

/**
 * The site's runtime, declared: one adapter per port and no alternatives, so every port is fixed to
 * what the account surface has always run. A `port.*` toggle in config — say a local override left in
 * this browser — names no adapter this declaration allows, and the port stays on its default, with the
 * reason logged.
 *
 * It takes the build's env reader because config is initialised from it, and only the account
 * surface's server answer (`app/config/subscriptionServer.ts`) holds that reader.
 */
export const landingRuntime = (env: (name: string) => string | undefined) =>
    defineRuntime({
        name: 'landing',
        facts: webHostFacts,
        ports: {
            storage: { default: storageLandingTab },
            transport: { default: transportBrowser },
            auth: { default: authLocation },
            cache: { default: cacheLandingWebStorage },
            foreground: { default: foregroundVisibility },
        },
        constraints: [],
        config: landingConfigPorts(env),
    });

/** What the account surface needs from the started runtime that the `runtime` facade does not sell. */
export interface LandingSession {
    /** Signs this tab in as the device's guest — the first step of a signed sign-in code exchange. */
    loginGuest(deviceId: string): Promise<unknown>;
}

let started: Promise<LandingSession> | undefined;

/**
 * Starts the declared runtime, once per page. It is not called from `main.tsx`: the public pages need
 * no session, so the runtime loads with the account surface's HTTP port, as a chunk of its own, and
 * this runs when that port is first made — before the session host renders, which waits for the port.
 * A second call answers with the first start, failed or not; a second start would open a second
 * session over the same stores.
 *
 * The runtime's default answer to a session the server confirms is over is an alert and a jump to a
 * logout page this site does not have. The port reports a refused call as `unauthenticated`, which the
 * route root already turns into the sign-in page with the way back, so that answer is switched off.
 */
export const startLandingRuntime = (env: (name: string) => string | undefined): Promise<LandingSession> =>
    (started ??= (async () => {
        const { engine } = await startRuntime(landingRuntime(env));
        if (!engine) throw new Error('[landing] the runtime started without an engine');
        runtime.session.authFailureReaction.register(() => undefined);
        return { loginGuest: deviceId => engine.commands.loginGuestByDevice(deviceId) };
    })());
