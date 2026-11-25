import * as headless from '@chatic/runtime';
import { fakeRuntimeOf } from '@chatic/runtime/testing';
import type { RuntimeOverrides as Overrides } from '@chatic/runtime/testing';

import * as facade from '../facade';

import type * as RuntimeReactModule from '../index';

type Runtime = typeof facade;

export type RuntimeOverrides = Overrides<Runtime>;

export {
    browserAppShell,
    browserDiagnostics,
    browserFiles,
    browserHostPorts,
    browserLinks,
    browserMedia,
    browserPush,
    browserSignIn,
    publishTestHostPorts,
    resetTestHostPorts,
} from '@chatic/runtime/testing';

export const fakeRuntime = (overrides: RuntimeOverrides = {}): Runtime => fakeRuntimeOf(facade, overrides);

export const fakeRuntimeModule = (overrides: RuntimeOverrides = {}): typeof RuntimeReactModule => ({
    ...headless,
    runtime: fakeRuntime(overrides),
});
