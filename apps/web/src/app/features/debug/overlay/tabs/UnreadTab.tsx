import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { useActiveCloudChannels, useChannelUnreads, useMyJoins } from '../../../home/hooks';
import { readCloudUnreadSnapshot, sumSnapshot } from '../../../home/lib';

// Unread inspector: observes the active cloud's full channel list and shows the same aggregates the
// home surface / app badge use — cloud total, per-site sums, and the per-channel unread list — plus
// the persisted per-cloud snapshot that feeds inactive-cloud dots and the badge sum. Read-only.
export const UnreadTab = () => {
    const channels = useActiveCloudChannels();
    const { byChannel, byPlace, total } = useChannelUnreads(channels, useMyJoins(channels));
    const nameById = new Map(channels.map(ch => [ch.id, ch.name ?? ch.id]));
    const snapshot = readCloudUnreadSnapshot();

    // "안읽음 목록" — only entries with unread > 0.
    const unreadPlaces = Object.entries(byPlace).filter(([, count]) => count > 0);
    const unreadChannels = Object.entries(byChannel).filter(([, count]) => count > 0);
    const snapshotClouds = Object.entries(snapshot).filter(([, count]) => count > 0);

    return (
        <div className="space-y-3">
            <Section title="전체">
                <Row label="활성 클라우드 안읽음 합계" value={total} />
                <Row label="관측 채널 수" value={channels.length} />
                <Row label="앱 뱃지 (방문 클라우드 합)" value={sumSnapshot(snapshot)} />
            </Section>

            <Section title={`사이트별 안읽음 (${unreadPlaces.length})`}>
                {unreadPlaces.length === 0 ? (
                    <p className="text-xs text-muted-foreground">안읽음이 있는 사이트가 없습니다</p>
                ) : (
                    unreadPlaces.map(([sid, count]) => <Row key={sid} label={sid} value={count} />)
                )}
            </Section>

            <Section title={`채널별 안읽음 (${unreadChannels.length})`}>
                {unreadChannels.length === 0 ? (
                    <p className="text-xs text-muted-foreground">안읽은 채널이 없습니다</p>
                ) : (
                    unreadChannels.map(([id, count]) => <Row key={id} label={nameById.get(id) || id} value={count} />)
                )}
            </Section>

            <Section title="클라우드 스냅샷">
                {snapshotClouds.length === 0 ? (
                    <p className="text-xs text-muted-foreground">기록된 클라우드가 없습니다</p>
                ) : (
                    snapshotClouds.map(([cid, count]) => <Row key={cid} label={cid} value={count} />)
                )}
            </Section>
        </div>
    );
};
