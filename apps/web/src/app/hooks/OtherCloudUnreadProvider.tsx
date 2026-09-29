import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { runtime } from '@chatic/app-runtime';

import { OtherCloudUnreadContext, type OtherCloudUnreadValue } from './otherCloudUnreadContext';
import { useCloudChannelsSource } from './useActiveCloudChannels';
import { useChannelUnreads } from './useChannelUnreads';
import { useCloudJoins } from './useMyJoins';
import { useOtherCloudIds } from './useOtherCloudUnread';

type ReportTotal = (cid: string, total: number) => void;

/**
 * Single owner of the inactive clouds' unread (see {@link OtherCloudUnreadContext}).
 *
 * Each inactive cloud gets one observer of its own partition — its channel rows, its places and my
 * join rows there, under the uid the account has in THAT cloud — and the count is the same
 * `useChannelUnreads` the active cloud runs. What keeps those partitions current is the runtime's
 * background receive loop: every cloud with a socket slot asks its server for a channel delta once a
 * minute, and sooner when the app hears of a push for it (see `CloudPushMarkRunner`).
 *
 * WHAT THIS REPLACED: a one-shot scan of every cached cloud, re-run when the active count moved. It
 * read each partition under the ACTIVE cloud's uid, which is not the uid the account has anywhere
 * else except by coincidence — the relay was never counted while a cloud was on screen. The
 * observers here follow each cloud's own uid, and they are live: a delta landing in a background
 * cloud moves its count without anyone asking.
 *
 * WHAT IT STILL CANNOT DO: a cloud without a slot — past the background cap, or with no tokens yet
 * — has no loop, so its count is its cache as it was when last received. The sheet's push mark
 * covers that case (see `CloudPushMarkRunner`).
 *
 * The active cloud id comes from the session here rather than from a prop, so no consumer can
 * disagree about which cloud is excluded.
 */
export const OtherCloudUnreadProvider = ({ children }: { children: ReactNode }) => {
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const cids = useOtherCloudIds(selectedCloudId);

    const [reported, setReported] = useState<Record<string, number>>({});
    // Only non-zero counts are kept: "absent" is what the sheet and the badge read as nothing unread,
    // and a state that changes from 0 to absent would re-render every consumer for no change.
    const report = useCallback<ReportTotal>((cid, total) => {
        setReported(previous => {
            if ((previous[cid] ?? 0) === total) return previous;
            const next = { ...previous };
            if (total > 0) next[cid] = total;
            else delete next[cid];
            return next;
        });
    }, []);

    // A cloud that just became the active one is still in `reported` until its observer's unmount
    // reports it gone, so the value is filtered to the current set rather than trusting the state.
    const byCloud = useMemo(() => {
        const inSet: Record<string, number> = {};
        for (const cid of cids) if (reported[cid]) inSet[cid] = reported[cid];
        return inSet;
    }, [reported, cids]);
    const total = useMemo(() => Object.values(byCloud).reduce((sum, n) => sum + n, 0), [byCloud]);

    const value = useMemo<OtherCloudUnreadValue>(() => ({ byCloud, total }), [byCloud, total]);

    return (
        <OtherCloudUnreadContext.Provider value={value}>
            {cids.map(cid => (
                <CloudUnreadSource key={cid} cid={cid} onTotal={report} />
            ))}
            {children}
        </OtherCloudUnreadContext.Provider>
    );
};

/**
 * One inactive cloud's count. Waits for the uid the account has there: without it there is no
 * partition to read, and reading under another cloud's uid is exactly the mistake this replaced.
 * Keyed by that uid, so a different account in the cloud starts a fresh observer rather than
 * carrying the previous one's rows for a render.
 *
 * Memoised so a count moving in one cloud does not re-render the others' observers.
 */
const CloudUnreadSource = memo(({ cid, onTotal }: { cid: string; onTotal: ReportTotal }) => {
    const uid = runtime.session.useUidInCloud(cid);
    return uid ? <CloudUnreadCounter key={uid} cid={cid} uid={uid} onTotal={onTotal} /> : null;
});
CloudUnreadSource.displayName = 'CloudUnreadSource';

const CloudUnreadCounter = ({ cid, uid, onTotal }: { cid: string; uid: string; onTotal: ReportTotal }) => {
    const { channels } = useCloudChannelsSource({ cid, uid });
    const joins = useCloudJoins(channels, { cid, uid });
    const { total } = useChannelUnreads(channels, joins);

    useEffect(() => {
        onTotal(cid, total);
    }, [cid, total, onTotal]);

    // Withdrawn when this observer goes — the cloud left the set, became the active one, or lost its
    // uid — so nothing is left counted for a cloud nobody is watching.
    useEffect(() => () => onTotal(cid, 0), [cid, onTotal]);

    return null;
};
