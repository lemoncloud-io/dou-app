import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { runtime } from '@chatic/runtime-react';

import { OtherCloudUnreadContext, type OtherCloudUnreadValue } from './otherCloudUnreadContext';
import { useCloudChannelsSource } from './useActiveCloudChannels';
import { useChannelUnreads } from './useChannelUnreads';
import { useCloudJoins } from './useMyJoins';
import { useOtherCloudIds } from './useOtherCloudUnread';

type ReportTotal = (cid: string, total: number) => void;

export const OtherCloudUnreadProvider = ({ children }: { children: ReactNode }) => {
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const cids = useOtherCloudIds(selectedCloudId);

    const [reported, setReported] = useState<Record<string, number>>({});
    const report = useCallback<ReportTotal>((cid, total) => {
        setReported(previous => {
            if ((previous[cid] ?? 0) === total) return previous;
            const next = { ...previous };
            if (total > 0) next[cid] = total;
            else delete next[cid];
            return next;
        });
    }, []);

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

    useEffect(() => () => onTotal(cid, 0), [cid, onTotal]);

    return null;
};
