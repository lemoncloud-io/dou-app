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
    <div
        style={{
            background: 'var(--sm-panel)',
            border: '1px solid var(--sm-border)',
            borderRadius: 10,
            padding: '13px 16px',
        }}
    >
        <div style={{ fontSize: 11, color: 'var(--sm-text-4)', marginBottom: 7 }}>{label}</div>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 26, fontWeight: 600, lineHeight: 1 }}>
            {value}
        </div>
    </div>
);

const breakdownTile = (label: string, c: StatusCounts) => (
    <div
        style={{
            background: 'var(--sm-panel)',
            border: '1px solid var(--sm-border)',
            borderRadius: 10,
            padding: '13px 16px',
        }}
    >
        <div style={{ fontSize: 11, color: 'var(--sm-text-4)', marginBottom: 9 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {(['green', 'yellow', 'red'] as const).map(k => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[k] }} />
                    <span
                        style={{
                            fontFamily: "'Geist Mono',monospace",
                            fontSize: 18,
                            fontWeight: 600,
                            lineHeight: 1,
                            color: c[k] > 0 ? 'var(--sm-text)' : 'var(--sm-text-7)',
                        }}
                    >
                        {c[k]}
                    </span>
                </div>
            ))}
        </div>
    </div>
);

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
