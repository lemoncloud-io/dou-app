import type { Watchlist } from '../../hooks/use-watchlist';
import SummaryStrip from './SummaryStrip';
import WatchlistMasterDetail from './WatchlistMasterDetail';

export interface ObserveTabProps {
    wl: Watchlist;
}

/** Observe 탭 — User Watchlist(요약 + 마스터-디테일). */
export default function ObserveTab({ wl }: ObserveTabProps) {
    const devices = wl.observed.flatMap(u => u.devices);
    const deviceCounts = { green: 0, yellow: 0, red: 0 };
    devices.forEach(d => (deviceCounts[d.status] += 1));
    const userCounts = { green: 0, yellow: 0, red: 0 };
    wl.observed.forEach(u => (userCounts[u.presence] += 1));

    return (
        <div style={{ padding: '22px 22px 28px', display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-.01em' }}>User Watchlist</h2>
                <span
                    style={{
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '.05em',
                        color: '#3fb950',
                        background: 'rgba(63,185,80,.1)',
                        border: '1px solid rgba(63,185,80,.25)',
                        borderRadius: 5,
                        padding: '2px 7px',
                    }}
                >
                    LIVE
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--sm-text-6)' }}>
                    특정 유저를 관측 대상으로 추가해 디바이스 상태·presence 추적 (users/0/list)
                </span>
            </div>

            <SummaryStrip
                observedCount={wl.observed.length}
                userCounts={userCounts}
                deviceCount={devices.length}
                deviceCounts={deviceCounts}
            />

            <WatchlistMasterDetail wl={wl} />
        </div>
    );
}
