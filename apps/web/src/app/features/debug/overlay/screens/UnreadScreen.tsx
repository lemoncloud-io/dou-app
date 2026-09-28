import { useCallback } from 'react';

import { CopyButton } from '../../components/CopyButton';
import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { useUnreadScreenStrings } from '../../i18n/screens/UnreadScreen';
import type { ActiveCloudData, OtherCloudUnread } from '../../../../hooks';
import { useDebugObservation } from '../sharedObservationStore';

// Unread inspector: shows the aggregates the home surface / app badge use — cloud total, per-site
// sums, the per-channel unread list — plus the inactive clouds read from the local cache, which is
// the badge's other half. Read-only, and it reads the app-wide shared observation rather than opening
// its own, so opening the overlay adds no subscriptions and no join sync registration.
//
// It gets that observation MIRRORED in (`sharedObservationStore`) rather than from the contexts: the
// overlay is mounted outside `AppRuntime` so it survives a boot hang, which also puts it outside the
// providers — consuming them here threw "ActiveCloudDataProvider is missing" and, inside the app-wide
// error boundary, replaced the entire UI with the error screen.
export const UnreadScreen = () => {
    const t = useUnreadScreenStrings();
    const { activeCloud, otherCloud } = useDebugObservation();

    // Nothing mirrored yet: the runtime has not committed the providers (boot hang, gated session).
    // Say that, rather than render zeros that would read as real counts.
    if (!activeCloud) {
        return <p className="p-4 text-xs text-muted-foreground">{t.notPublished}</p>;
    }

    return <UnreadReport activeCloud={activeCloud} otherCloud={otherCloud} />;
};

const UnreadReport = ({
    activeCloud,
    otherCloud,
}: {
    activeCloud: ActiveCloudData;
    otherCloud: OtherCloudUnread | null;
}) => {
    const t = useUnreadScreenStrings();
    // The two records the count is derived from, shown raw. A wrong badge is almost never a wrong
    // formula — it is one of these four numbers being stale or missing, and reading them off the
    // device is the only way to tell which (ADR-0048).
    const { channels, myJoins, unreads } = activeCloud;
    const { byChannel, byPlace, total } = unreads;
    // The cross-cloud read is published by the same reporter, but it is a separate provider: treat a
    // missing half as 0 instead of hiding the active-cloud numbers that ARE there.
    const otherByCloud = otherCloud?.byCloud ?? {};
    const otherTotal = otherCloud?.total ?? 0;
    const nameById = new Map(channels.map(ch => [ch.id, ch.name ?? ch.id]));

    // "Unread list" — only entries with unread > 0.
    const unreadPlaces = Object.entries(byPlace).filter(([, count]) => count > 0);
    const unreadChannels = Object.entries(byChannel).filter(([, count]) => count > 0);
    const otherClouds = Object.entries(otherByCloud).filter(([, count]) => count > 0);

    // Channels worth inspecting: anything wearing a badge, plus any channel whose join row carries
    // no `metaNo` snapshot — that is the row whose cursor cannot be converted, so its count is the
    // one that runs low until the room is read again.
    const derivationRows = channels
        .map(channel => {
            const join = myJoins.get(channel.id);
            return {
                id: channel.id,
                name: channel.name ?? channel.id,
                headChatNo: channel.chatNo ?? 0,
                headMetaNo: channel.metaNo ?? 0,
                cursor: join ? Math.max(join.readNo ?? 0, join.chatNo ?? 0) : t.none,
                cursorMetaNo: join?.metaNo ?? t.none,
                unread: byChannel[channel.id] ?? 0,
                hasSnapshot: join?.metaNo !== undefined,
            };
        })
        .filter(row => row.unread > 0 || !row.hasSnapshot)
        .slice(0, 30);

    const snapshot = useCallback(
        () =>
            JSON.stringify(
                {
                    total,
                    otherTotal,
                    badge: total + otherTotal,
                    channelCount: channels.length,
                    unreadPlaces,
                    unreadChannels,
                    otherClouds,
                    derivationRows,
                },
                null,
                2
            ),
        [total, otherTotal, channels.length, unreadPlaces, unreadChannels, otherClouds, derivationRows]
    );

    return (
        <div className="space-y-3 p-4">
            <div className="flex justify-end">
                <CopyButton value={snapshot} label={t.copyUnread} />
            </div>

            <Section title={t.total.title}>
                <Row label={t.total.activeCloudTotal} value={total} />
                <Row label={t.total.observedChannels} value={channels.length} />
                <Row label={t.total.inactiveCloudTotal} value={otherTotal} />
                <Row label={t.total.appBadge} value={total + otherTotal} />
            </Section>

            <Section title={t.bySite.title(unreadPlaces.length)}>
                {unreadPlaces.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t.bySite.empty}</p>
                ) : (
                    unreadPlaces.map(([sid, count]) => <Row key={sid} label={sid} value={count} />)
                )}
            </Section>

            <Section title={t.byChannel.title(unreadChannels.length)}>
                {unreadChannels.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t.byChannel.empty}</p>
                ) : (
                    unreadChannels.map(([id, count]) => <Row key={id} label={nameById.get(id) || id} value={count} />)
                )}
            </Section>

            <Section title={t.derivation.title(derivationRows.length)}>
                {derivationRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t.derivation.empty}</p>
                ) : (
                    derivationRows.map(row => (
                        <Row
                            key={row.id}
                            label={row.name}
                            value={t.derivation.value(
                                row.headChatNo,
                                row.headMetaNo,
                                row.cursor,
                                row.cursorMetaNo,
                                row.unread
                            )}
                        />
                    ))
                )}
            </Section>

            <Section title={t.inactiveClouds.title}>
                {otherClouds.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t.inactiveClouds.empty}</p>
                ) : (
                    otherClouds.map(([cid, count]) => <Row key={cid} label={cid} value={count} />)
                )}
            </Section>
        </div>
    );
};
