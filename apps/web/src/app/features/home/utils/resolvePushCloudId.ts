import { pushCloudIdOf, type GlobalCacheContext, type GlobalCacheRef } from '@chatic/runtime';

import type { PushCloudHint } from '../../../utils/resolveInAppPushRoute';

export { RELAY_CLOUD_ID } from '@chatic/runtime';

export interface ResolvePushCloudIdDeps {
    cids: string[];
    resolveContext: (refs: { cids: string[]; channelRefs: GlobalCacheRef[] }) => Promise<GlobalCacheContext>;
}

const cidOf = (ref: string): string => ref.slice(0, ref.indexOf(':'));

export const resolvePushCloudId = async (
    hint: PushCloudHint,
    { cids, resolveContext }: ResolvePushCloudIdDeps
): Promise<string | null> => {
    const stamped = pushCloudIdOf(hint.cid);
    if (stamped) return stamped;

    if (!hint.uid && !hint.channelId) return null;
    if (cids.length === 0) return null;

    const context = await resolveContext({ cids, channelRefs: [] });

    if (hint.uid) {
        const cloudIds = new Set<string>();
        for (const [ref, join] of Object.entries(context.joinsByRef)) {
            if (join.userId === hint.uid) cloudIds.add(cidOf(ref));
        }
        if (cloudIds.size === 1) return [...cloudIds][0];
    }

    if (!hint.channelId) return null;
    let candidates = Object.entries(context.channelsByRef).filter(([, ch]) => ch.id === hint.channelId);
    if (hint.sid) {
        const bySid = candidates.filter(([, ch]) => ch.sid === hint.sid);
        if (bySid.length > 0) candidates = bySid;
    }
    if (hint.channelName) {
        const byName = candidates.filter(([, ch]) => ch.name === hint.channelName);
        if (byName.length > 0) candidates = byName;
    }

    const cloudIds = new Set(candidates.map(([ref]) => cidOf(ref)).filter(Boolean));
    return cloudIds.size === 1 ? [...cloudIds][0] : null;
};
