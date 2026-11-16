import type { SubWebViewRuntimePermission } from '@chatic/bridge-messages';
import type { SubWebViewTrust } from '@chatic/shared';

import { settledSessionOwner } from '../services/runtime/launchSessionOwner';
import type * as NativeRuntimeModule from '../services/runtime/nativeRuntime';
import { createSubWebViewReadBudget, type SubWebViewReadBudget } from './subWebViewReadBudget';
import type { SubWebViewRuntimeConsent } from './subWebViewRuntimeConsent';
import type * as ConsentPromptModule from './subWebViewRuntimeConsentPrompt';
import { cloudOfSession, grantedSubWebViewRuntime } from './subWebViewRuntimeGate';

type Engine = NonNullable<ReturnType<(typeof NativeRuntimeModule)['nativeRuntimeHost']['engine']>>;

/** What one view's runtime requests are answered with, for the life of the view. */
export interface SubWebViewRuntimeAccess {
    engine: Engine;
    openedCloudId: string;
    granted: ReadonlySet<SubWebViewRuntimePermission>;
    /** Per view, so a page cannot reset it by reloading. */
    budget: SubWebViewReadBudget;
    consent: SubWebViewRuntimeConsent;
}

/**
 * Settles, once as the view opens, whether its page may ask the app's runtime anything, and binds it
 * to the cloud selected then. `null` — no runtime requests at all — unless the gate grants something.
 *
 * Checks the cheap conditions before it loads anything: the runtime module is required only on a
 * launch whose session it holds, where it is already loaded.
 */
export const openSubWebViewRuntime = ({
    trust,
    permissions,
}: {
    trust: SubWebViewTrust;
    permissions: ReadonlySet<SubWebViewRuntimePermission>;
}): SubWebViewRuntimeAccess | null => {
    const owner = settledSessionOwner();
    if (owner !== 'native' || trust !== 'reviewed' || permissions.size === 0) return null;
    const { nativeRuntimeHost } = require('../services/runtime/nativeRuntime') as typeof NativeRuntimeModule;
    const engine = nativeRuntimeHost.engine();
    if (!engine) return null;
    const openedCloudId = cloudOfSession(engine.session.snapshot());
    const granted = grantedSubWebViewRuntime({ owner, trust, permissions, openedCloudId });
    if (granted.size === 0 || openedCloudId === null) return null;
    const { createAppSubWebViewRuntimeConsent } =
        require('./subWebViewRuntimeConsentPrompt') as typeof ConsentPromptModule;
    return {
        engine,
        openedCloudId,
        granted,
        budget: createSubWebViewReadBudget(),
        consent: createAppSubWebViewRuntimeConsent(),
    };
};
