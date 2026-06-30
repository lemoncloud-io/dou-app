export interface StatusCounts {
    green: number;
    yellow: number;
    red: number;
}

export interface SummaryStripProps {
    observedCount: number;
    userCounts: StatusCounts;
    deviceCount: number;
    deviceCounts: StatusCounts;
}

const COLORS = { green: '#3fb950', yellow: '#d29922', red: '#f85149' } as const;

const countTile = (label: string, value: number) => (
    <div style={{ background: '#0e131b', border: '1px solid #1a212c', borderRadius: 10, padding: '13px 16px' }}>
        <div style={{ fontSize: 11, color: '#7d8590', marginBottom: 7 }}>{label}</div>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 26, fontWeight: 600, lineHeight: 1 }}>{value}</div>
    </div>
);

const breakdownTile = (label: string, c: StatusCounts) => (
    <div style={{ background: '#0e131b', border: '1px solid #1a212c', borderRadius: 10, padding: '13px 16px' }}>
        <div style={{ fontSize: 11, color: '#7d8590', marginBottom: 9 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {(['green', 'yellow', 'red'] as const).map(k => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[k] }} />
                    <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 18, fontWeight: 600, lineHeight: 1, color: c[k] > 0 ? '#e6edf3' : '#4b545f' }}>{c[k]}</span>
                </div>
            ))}
        </div>
    </div>
);

/** 워치리스트 상단 집계 — 유저/디바이스 수 + presence/status 브레이크다운. */
export default function SummaryStrip({ observedCount, userCounts, deviceCount, deviceCounts }: SummaryStripProps) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {countTile('Observed Users', observedCount)}
            {breakdownTile('User presence', userCounts)}
            {countTile('Watched Devices', deviceCount)}
            {breakdownTile('Device status', deviceCounts)}
        </div>
    );
}
