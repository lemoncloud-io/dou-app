import type { GlobalCacheContext, GlobalCacheRef } from '@chatic/data';

import type { PushCloudHint } from '../../../utils/resolveInAppPushRoute';

/** ADR-0045 relay sentinel — a push whose `cid` is this literal originated from the relay cloud. */
const RELAY_ORIGIN_CID = '#';
/** Relay mode reads as this cloud id everywhere else in the app (see useSessionSelection). */
export const RELAY_CLOUD_ID = 'default';

/** Injected so the resolver stays a pure function — no hook, no module-level cache access. */
export interface ResolvePushCloudIdDeps {
    /** Every cloud the account might belong to — owned + invited + relay. */
    cids: string[];
    resolveContext: (refs: { cids: string[]; channelRefs: GlobalCacheRef[] }) => Promise<GlobalCacheContext>;
}

const cidOf = (ref: string): string => ref.slice(0, ref.indexOf(':'));

/**
 * Resolves which cloud a cross-cloud push came from, for marking that cloud's dot (ADR-0056 결정 2).
 * The single place in the app that interprets a push's raw cloud hint — native storage and the
 * foreground bridge both hand off the hint fields as-is, unparsed.
 *
 * `'#'`/valid `cid` short-circuit; an empty `cid` (the deployed backend's shape, see
 * docs/specs/cross-cloud-push.md §0) falls back to a cross-partition cache read via
 * `resolveContext` — the only cross-cloud reader in the app (repositories are scoped to the active
 * cloud). Each narrowing step applies ONLY when it leaves a candidate, and a non-unique result is
 * `null` rather than a guess: a false dot is worse than a missing one (ADR-0056).
 */
export const resolvePushCloudId = async (
    hint: PushCloudHint,
    { cids, resolveContext }: ResolvePushCloudIdDeps
): Promise<string | null> => {
    if (hint.cid === RELAY_ORIGIN_CID) return RELAY_CLOUD_ID;
    if (hint.cid) return hint.cid;

    if (!hint.uid && !hint.channelId) return null;
    if (cids.length === 0) return null;

    const context = await resolveContext({ cids, channelRefs: [] });

    // Primary: my join row's userId, unique to one cloud (mirrors desktop's resolvePushCloudId).
    if (hint.uid) {
        const cloudIds = new Set<string>();
        for (const [ref, join] of Object.entries(context.joinsByRef)) {
            if (join.userId === hint.uid) cloudIds.add(cidOf(ref));
        }
        if (cloudIds.size === 1) return [...cloudIds][0];
    }

    // Fallback: reverse-look the channel id up, narrowed by sid/name when present.
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
