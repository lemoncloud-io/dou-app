import { useCallback } from 'react';

import { CopyButton } from '../../components/CopyButton';
import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { useUnreadScreenStrings } from '../../i18n/screens/UnreadScreen';
import type { ActiveCloudData, OtherCloudUnread } from '../../../../hooks';
import { readCursorOf, readPositionOf } from '../../../../utils/countUnread';
import { useDebugObservation } from '../sharedObservationStore';

export const UnreadScreen = () => {
    const t = useUnreadScreenStrings();
    const { activeCloud, otherCloud } = useDebugObservation();

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
    const { channels, myJoins, unreads } = activeCloud;
    const { byChannel, byPlace, total } = unreads;
    const otherByCloud = otherCloud?.byCloud ?? {};
    const otherTotal = otherCloud?.total ?? 0;
    const nameById = new Map(channels.map(ch => [ch.id, ch.name ?? ch.id]));

    const unreadPlaces = Object.entries(byPlace).filter(([, count]) => count > 0);
    const unreadChannels = Object.entries(byChannel).filter(([, count]) => count > 0);
    const otherClouds = Object.entries(otherByCloud).filter(([, count]) => count > 0);

    const derivationRows = channels
        .map(channel => {
            const position = readPositionOf(myJoins.get(channel.id), channel.$join);
            return {
                id: channel.id,
                name: channel.name ?? channel.id,
                headChatNo: channel.chatNo ?? 0,
                headMetaNo: channel.metaNo ?? 0,
                cursor: readCursorOf(position) ?? t.none,
                cursorMetaNo: position?.metaNo ?? t.none,
                unread: byChannel[channel.id] ?? 0,
                hasSnapshot: position?.metaNo !== undefined,
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
