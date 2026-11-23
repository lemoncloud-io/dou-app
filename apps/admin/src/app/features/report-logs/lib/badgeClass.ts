import type { ReportLogRow } from './parseReportLog';

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

const LEVEL_TEXT = new Map<string, string>([
    ['error', 'text-destructive'],
    ['warn', 'text-yellow-600 dark:text-yellow-500'],
    ['info', 'text-foreground'],
    ['debug', 'text-muted-foreground'],
]);

export const rowBadge = (row: ReportLogRow): { label: string; className: string } =>
    row.type === 'log-entry'
        ? { label: row.level ?? 'log', className: levelBadgeClass(row.level) }
        : { label: row.type, className: typeBadgeClass(row.type) };

export const levelBadgeClass = (level?: string): string => LEVEL_BADGE.get(level ?? '') ?? UNKNOWN_BADGE;

export const levelTextClass = (level?: string): string => LEVEL_TEXT.get(level ?? '') ?? 'text-foreground';

export const typeBadgeClass = (type: ReportLogRow['type']): string => TYPE_BADGE[type] ?? UNKNOWN_BADGE;
