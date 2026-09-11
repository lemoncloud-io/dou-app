/**
 * `components/memberships/MembershipStatusStrip.tsx`
 * - Status counts across the top of the console.
 *
 * "What does this slice look like" is a different question from "find me this user", and it should
 * not require scrolling the table to answer. So the answer sits above the view, always visible.
 *
 * The counts describe the rows on screen, never the whole result. The membership list endpoint
 * returns no aggregation — unlike the cloud list — so a number that looked like a total would be a
 * lie. The caption says which it is.
 */
import type { MembershipView } from '@lemoncloud/chatic-backend-api';

interface MembershipStatusStripProps {
    /** Rows after the browser-side filters, i.e. exactly what the table shows. */
    rows: MembershipView[];
    /** Rows the server returned for this page, before those filters. */
    pageSize: number;
    /** The server's count for the whole query. */
    total: number;
}

/** Shown first, in lifecycle order rather than by frequency, so the strip reads the same every
 *  time. Anything else the relay emits is appended after these rather than dropped. */
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
                서버 <span className="tabular-nums text-foreground">{total.toLocaleString()}</span>건
            </span>
            <span className="text-muted-foreground">
                이 페이지 <span className="tabular-nums text-foreground">{pageSize}</span>건
            </span>
            <span className="text-muted-foreground">
                표시 <span className="tabular-nums text-foreground">{rows.length}</span>건
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
                <span className="text-amber-400" title="서버가 조회 시점에 무효로 판정한 행">
                    invalid <span className="tabular-nums">{invalid}</span>
                </span>
            )}

            <span className="text-muted-foreground/70">· 집계는 화면에 보이는 행 기준</span>
        </div>
    );
};
