/**
 * `lib/report-logs/badgeClass.ts`
 * - Badge colours for a row's kind and level, in one place.
 *
 * The list, the group table and the detail panel all label the same rows, and when these
 * palettes lived in each component they had already started to drift. A level badge that
 * means "error" in the list and something else in the panel is worse than no colour.
 */
import type { ReportLogRow } from './parseReportLog';

/**
 * Plain-object lookups are avoided here on purpose. `row.level` comes straight from
 * `meta.level` with no union check, so `level: 'toString'` or `'constructor'` would
 * inherit a function off `Object.prototype` — truthy, so it survives `??` and lands in a
 * `className`. A `Map` has no prototype chain to fall through.
 */
const TYPE_BADGE: Record<ReportLogRow['type'], string> = {
    error: 'bg-destructive text-destructive-foreground',
    issue: 'bg-primary text-primary-foreground',
    'log-entry': 'bg-muted text-muted-foreground',
    unknown: 'bg-muted text-muted-foreground',
};

const LEVEL_BADGE = new Map<string, string>([
    ['error', 'bg-destructive text-destructive-foreground'],
    ['warn', 'bg-yellow-500 text-black'],
    ['info', 'bg-primary text-primary-foreground'],
    ['debug', 'bg-muted text-muted-foreground'],
]);

const UNKNOWN_BADGE = 'bg-muted text-muted-foreground';

/**
 * Text colour for a level, where a badge would be too heavy — the detail panel's log list
 * and the run timeline read as text, not as chips. Kept beside the badge palette so the
 * two cannot drift, which is what happened when the detail view carried its own copy.
 */
const LEVEL_TEXT = new Map<string, string>([
    ['error', 'text-destructive'],
    ['warn', 'text-yellow-600 dark:text-yellow-500'],
    ['info', 'text-foreground'],
    ['debug', 'text-muted-foreground'],
]);

/**
 * The badge a row should wear, and the text on it.
 *
 * A log entry shows its **level**, not the generic `log-entry` kind: the kind is the same
 * for every batch-uploaded row, so it carries no information, while the level is the axis
 * an operator scans by. Reports show their kind, since `issue` vs `error` is the
 * distinction that matters for them.
 */
export const rowBadge = (row: ReportLogRow): { label: string; className: string } =>
    row.type === 'log-entry'
        ? { label: row.level ?? 'log', className: levelBadgeClass(row.level) }
        : { label: row.type, className: typeBadgeClass(row.type) };

/** Badge for a bare level string, where there is no row to read it from. */
export const levelBadgeClass = (level?: string): string => LEVEL_BADGE.get(level ?? '') ?? UNKNOWN_BADGE;

/** Text colour for a bare level string. */
export const levelTextClass = (level?: string): string => LEVEL_TEXT.get(level ?? '') ?? 'text-foreground';

/** Badge for a bare kind, used by the group table's dominant-type column. */
export const typeBadgeClass = (type: ReportLogRow['type']): string => TYPE_BADGE[type] ?? UNKNOWN_BADGE;
