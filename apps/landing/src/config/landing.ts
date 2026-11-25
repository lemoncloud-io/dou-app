import { runtime } from '@chatic/runtime-react';
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

export interface LandingSession {
    loginGuest(deviceId: string): Promise<unknown>;
}

let started: Promise<LandingSession> | undefined;

export const startLandingRuntime = (env: (name: string) => string | undefined): Promise<LandingSession> =>
    (started ??= (async () => {
        const { engine } = await startRuntime(landingRuntime(env));
        if (!engine) throw new Error('[landing] the runtime started without an engine');
        runtime.session.authFailureReaction.register(() => undefined);
        return { loginGuest: deviceId => engine.commands.loginGuestByDevice(deviceId) };
    })());
