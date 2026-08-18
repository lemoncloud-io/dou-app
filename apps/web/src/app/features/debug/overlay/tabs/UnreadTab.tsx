import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
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
export const UnreadTab = () => {
    const { activeCloud, otherCloud } = useDebugObservation();

    // Nothing mirrored yet: the runtime has not committed the providers (boot hang, gated session).
    // Say that, rather than render zeros that would read as real counts.
    if (!activeCloud) {
        return (
            <p className="text-xs text-muted-foreground">
                공유 관측이 아직 게시되지 않았습니다 — 앱 런타임(ActiveCloudDataProvider)이 마운트되기 전입니다
            </p>
        );
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

    // "안읽음 목록" — only entries with unread > 0.
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
                cursor: join ? Math.max(join.readNo ?? 0, join.chatNo ?? 0) : '없음',
                cursorMetaNo: join?.metaNo ?? '없음',
                unread: byChannel[channel.id] ?? 0,
                hasSnapshot: join?.metaNo !== undefined,
            };
        })
        .filter(row => row.unread > 0 || !row.hasSnapshot)
        .slice(0, 30);

    return (
        <div className="space-y-3">
            <Section title="전체">
                <Row label="활성 클라우드 안읽음 합계" value={total} />
                <Row label="관측 채널 수" value={channels.length} />
                <Row label="비활성 클라우드 합계 (캐시)" value={otherTotal} />
                <Row label="앱 뱃지 (활성 + 비활성)" value={total + otherTotal} />
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

            <Section title={`파생 입력 (${derivationRows.length})`}>
                {derivationRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">안읽음도, 스냅샷 없는 커서도 없습니다</p>
                ) : (
                    derivationRows.map(row => (
                        <Row
                            key={row.id}
                            label={row.name}
                            value={`머리 ${row.headChatNo}/${row.headMetaNo} · 커서 ${row.cursor}/${row.cursorMetaNo} = ${row.unread}`}
                        />
                    ))
                )}
            </Section>

            <Section title="비활성 클라우드 (로컬 캐시 기준)">
                {otherClouds.length === 0 ? (
                    <p className="text-xs text-muted-foreground">안읽음이 있는 비활성 클라우드가 없습니다</p>
                ) : (
                    otherClouds.map(([cid, count]) => <Row key={cid} label={cid} value={count} />)
                )}
            </Section>
        </div>
    );
};
