import type { SubWebViewRuntimePermission } from '@chatic/bridge-messages';
import type { SubWebViewTrust } from '@chatic/shared';

import { settledSessionOwner } from '../services/runtime/launchSessionOwner';
import type * as NativeRuntimeModule from '../services/runtime/nativeRuntime';
import {
    createSubWebViewReadBudget,
    SUB_WEBVIEW_CACHE_READS,
    SUB_WEBVIEW_MESSAGE_SENDS,
    SUB_WEBVIEW_REACTIONS,
    type SubWebViewReadBudget,
} from './subWebViewReadBudget';
import { subWebViewReportsFrameOrigin } from './subWebViewFrameOrigin';
import type { SubWebViewRuntimeConsent } from './subWebViewRuntimeConsent';
import type * as ConsentPromptModule from './subWebViewRuntimeConsentPrompt';
import { cloudOfSession, grantedSubWebViewRuntime, placeOfSession } from './subWebViewRuntimeGate';

type Engine = NonNullable<ReturnType<(typeof NativeRuntimeModule)['nativeRuntimeHost']['engine']>>;

export interface SubWebViewRuntimeAccess {
    engine: Engine;
    openedCloudId: string;
    openedPlaceId: string | null;
    granted: ReadonlySet<SubWebViewRuntimePermission>;
    budget: SubWebViewReadBudget;
    sends: SubWebViewReadBudget;
    cacheReads: SubWebViewReadBudget;
    reactions: SubWebViewReadBudget;
    consent: SubWebViewRuntimeConsent;
}

export const openSubWebViewRuntime = ({
    trust,
    permissions,
}: {
    trust: SubWebViewTrust;
    permissions: ReadonlySet<SubWebViewRuntimePermission>;
}): SubWebViewRuntimeAccess | null => {
    const owner = settledSessionOwner();
    const reportsFrameOrigin = subWebViewReportsFrameOrigin();
    if (owner !== 'native' || trust !== 'reviewed' || !reportsFrameOrigin || permissions.size === 0) return null;
    const { nativeRuntimeHost } = require('../services/runtime/nativeRuntime') as typeof NativeRuntimeModule;
    const engine = nativeRuntimeHost.engine();
    if (!engine) return null;
    const openedCloudId = cloudOfSession(engine.session.snapshot());
    const granted = grantedSubWebViewRuntime({ owner, trust, permissions, openedCloudId, reportsFrameOrigin });
    if (granted.size === 0 || openedCloudId === null) return null;
    const { createAppSubWebViewRuntimeConsent } =
        require('./subWebViewRuntimeConsentPrompt') as typeof ConsentPromptModule;
    return {
        engine,
        openedCloudId,
        openedPlaceId: placeOfSession(engine.session.snapshot()),
        granted,
        budget: createSubWebViewReadBudget(),
        sends: createSubWebViewReadBudget(SUB_WEBVIEW_MESSAGE_SENDS),
        cacheReads: createSubWebViewReadBudget(SUB_WEBVIEW_CACHE_READS),
        reactions: createSubWebViewReadBudget(SUB_WEBVIEW_REACTIONS),
        consent: createAppSubWebViewRuntimeConsent(),
    };
};
