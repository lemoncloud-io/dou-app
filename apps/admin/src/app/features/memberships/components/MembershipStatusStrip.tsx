import type { MembershipView } from '@lemoncloud/chatic-backend-api';

interface MembershipStatusStripProps {
    rows: MembershipView[];
    pageSize: number;
    total: number;
}

const KNOWN_STATUSES = ['active', 'canceled', 'expired', 'none'] as const;

const TONE: Record<string, string> = {
    active: 'text-emerald-400',
    canceled: 'text-amber-400',
    expired: 'text-muted-foreground',
    none: 'text-muted-foreground',
};

export const MembershipStatusStrip = ({ rows, pageSize, total }: MembershipStatusStripProps) => {
    const counts = rows.reduce<Record<string, number>>((acc, row) => {
        const key = row.status || 'unknown';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
    }, {});
    const extra = Object.keys(counts).filter(key => !KNOWN_STATUSES.includes(key as never));
    const invalid = rows.filter(row => row.isValid === false).length;

    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">
                Server <span className="tabular-nums text-foreground">{total.toLocaleString()}</span>
            </span>
            <span className="text-muted-foreground">
                This page <span className="tabular-nums text-foreground">{pageSize}</span>
            </span>
            <span className="text-muted-foreground">
                Shown <span className="tabular-nums text-foreground">{rows.length}</span>
            </span>

            <span className="h-3 w-px bg-border" />

            {[...KNOWN_STATUSES, ...extra].map(status =>
                counts[status] ? (
                    <span key={status} className={TONE[status] ?? 'text-foreground'}>
                        {status} <span className="tabular-nums">{counts[status]}</span>
                    </span>
                ) : null
            )}
            {invalid > 0 && (
                <span className="text-amber-400" title="Rows the server judged invalid at query time">
                    invalid <span className="tabular-nums">{invalid}</span>
                </span>
            )}

            <span className="text-muted-foreground/70">· counts reflect the rows on screen</span>
        </div>
    );
};
