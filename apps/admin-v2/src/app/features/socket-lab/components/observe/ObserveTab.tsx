import type { Watchlist } from '../../hooks/use-watchlist';
import SummaryStrip from './SummaryStrip';
import WatchlistMasterDetail from './WatchlistMasterDetail';

export interface ObserveTabProps {
    wl: Watchlist;
}

/** Observe 탭 — User Watchlist(요약 + 마스터-디테일). */
export default function ObserveTab({ wl }: ObserveTabProps) {
    const devices = wl.observed.flatMap(u => u.devices);
    const counts = { green: 0, yellow: 0, red: 0 };
    devices.forEach(d => (counts[d.status] += 1));
    const issuesCount = counts.yellow + counts.red;
    const issuesColor = counts.red > 0 ? '#f85149' : counts.yellow > 0 ? '#d29922' : '#3fb950';

    return (
        <div style={{ padding: '22px 22px 28px', display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-.01em' }}>User Watchlist</h2>
                <span
                    style={{
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '.05em',
                        color: '#d29922',
                        background: 'rgba(210,153,34,.1)',
                        border: '1px solid rgba(210,153,34,.25)',
                        borderRadius: 5,
                        padding: '2px 7px',
                    }}
                >
                    MOCK
                </span>
                <span style={{ fontSize: 11.5, color: '#5a636e' }}>
                    특정 유저를 관측 대상으로 추가해 디바이스 상태를 추적 · 서버 연동 대기
                </span>
            </div>

            <SummaryStrip
                observedCount={wl.observed.length}
                totalDevices={devices.length}
                viewingCount={devices.filter(d => d.viewing).length}
                issuesCount={issuesCount}
                issuesColor={issuesColor}
            />

            <WatchlistMasterDetail wl={wl} />
        </div>
    );
}
