import { ACCENT } from '../../lib/stats';

export interface SummaryStripProps {
    observedCount: number;
    totalDevices: number;
    viewingCount: number;
    issuesCount: number;
    issuesColor: string;
}

const tile = (label: string, value: string | number, opts?: { dot?: string; valColor?: string }) => (
    <div style={{ background: '#0e131b', border: '1px solid #1a212c', borderRadius: 10, padding: '13px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: '#7d8590', marginBottom: 7 }}>
            {opts?.dot ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: opts.dot }} /> : null}
            {label}
        </div>
        <div
            style={{
                fontFamily: "'Geist Mono',monospace",
                fontSize: 26,
                fontWeight: 600,
                lineHeight: 1,
                color: opts?.valColor,
            }}
        >
            {value}
        </div>
    </div>
);

/** 워치리스트 상단 4타일 집계. */
export default function SummaryStrip({
    observedCount,
    totalDevices,
    viewingCount,
    issuesCount,
    issuesColor,
}: SummaryStripProps) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {tile('Observed Users', observedCount)}
            {tile('Watched Devices', totalDevices)}
            {tile('Viewing now', viewingCount, { dot: ACCENT, valColor: ACCENT })}
            {tile('Issues', issuesCount, { dot: issuesColor, valColor: issuesColor })}
        </div>
    );
}
