import type { Watchlist } from '../../hooks/use-watchlist';
import type { UsersStage } from '../../api/userApi';
import SummaryStrip from './SummaryStrip';
import WatchlistMasterDetail from './WatchlistMasterDetail';

/** 스테이지별 라벨/강조색 — v1(운영)은 경고 색으로 구분 */
const STAGES: { value: UsersStage; label: string; color: string }[] = [
    { value: 'd1', label: 'DEV (d1)', color: '#3fb950' },
    { value: 'v1', label: 'PROD (v1)', color: '#e5484d' },
];

export interface ObserveTabProps {
    wl: Watchlist;
}

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
                <div
                    style={{
                        marginLeft: 'auto',
                        display: 'flex',
                        border: '1px solid var(--sm-border-2)',
                        borderRadius: 7,
                        overflow: 'hidden',
                    }}
                >
                    {STAGES.map(s => {
                        const active = wl.stage === s.value;
                        return (
                            <button
                                key={s.value}
                                onClick={() => wl.setStage(s.value)}
                                title={`skt-${s.value} 엔드포인트로 전환`}
                                style={{
                                    appearance: 'none',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    fontSize: 10.5,
                                    fontWeight: 600,
                                    letterSpacing: '.04em',
                                    padding: '5px 11px',
                                    border: 'none',
                                    background: active ? `${s.color}1f` : 'var(--sm-panel)',
                                    color: active ? s.color : 'var(--sm-text-6)',
                                }}
                            >
                                {s.label}
                            </button>
                        );
                    })}
                </div>
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
