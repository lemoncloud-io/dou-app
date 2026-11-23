import type { TFunction } from 'i18next';

import type { Language } from '../../../i18n';
import { EVENT_NAMES } from '../../../i18n/locales';
import { areaOfTag, type ReportLogRow } from './parseReportLog';
import { recordKindOf } from './recordKinds';
import { formatDuration } from './timeFormat';

export type Tone = 'error' | 'report' | 'warn' | 'plain' | 'stat';

export interface RowSentence {
    tone: Tone;
    text: string;
    raw?: string;
}

const own = (map: Record<string, string>, key: string | undefined): string | undefined =>
    key !== undefined && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;

export const eventNameOf = (tag: string | undefined, lng: Language): string | undefined => {
    if (!tag) return undefined;
    const names = EVENT_NAMES[lng];
    return own(names.tags, tag) ?? own(names.areas, areaOfTag(tag));
};

export const eventLabelOf = (tag: string, lng: Language): string => eventNameOf(tag, lng) ?? tag;

export const toneOf = (row: ReportLogRow): Tone => {
    if (row.type === 'issue') return 'report';
    if (row.type === 'error' || row.level === 'error') return 'error';
    if (recordKindOf(row) !== 'log') return 'stat';
    if (row.level === 'warn') return 'warn';
    return 'plain';
};

const attrSummary = (row: ReportLogRow): string =>
    Object.entries(row.attrs ?? {})
        .map(([key, value]) => `${key}=${value}`)
        .join(' · ');

export const describeRow = (row: ReportLogRow, t: TFunction, lng: Language): RowSentence => {
    const tone = toneOf(row);
    const raw = row.tag;

    if (row.type === 'issue') {
        return { tone, text: t('sentence.report', { title: row.title }), raw };
    }

    const kind = recordKindOf(row);
    const name = eventNameOf(row.tag, lng);

    if (kind === 'event') {
        if (row.tag === 'usage.screen_view') {
            return {
                tone,
                text: t('sentence.screenView', { screen: row.attrs?.screen ?? row.routeTemplate ?? '-' }),
                raw,
            };
        }
        if (row.tag === 'usage.session_start') return { tone, text: t('sentence.sessionStart'), raw };
        if (row.tag === 'usage.session_end') {
            const duration = row.metrics?.duration_ms;
            return {
                tone,
                text:
                    duration === undefined
                        ? t('sentence.sessionEnd')
                        : t('sentence.sessionEndAfter', { duration: formatDuration(duration, lng) }),
                raw,
            };
        }
        return { tone, text: t('sentence.event', { name: name ?? row.tag ?? '-', detail: attrSummary(row) }), raw };
    }

    if (kind === 'trace' || kind === 'sample') {
        const took = row.durationMs ?? row.metrics?.value_ms;
        const outcome = row.attrs?.outcome;
        const label = name ?? row.tag ?? '-';
        if (took !== undefined) {
            return {
                tone,
                text: outcome
                    ? t('sentence.timedWithOutcome', { name: label, duration: formatDuration(took, lng), outcome })
                    : t('sentence.timed', { name: label, duration: formatDuration(took, lng) }),
                raw,
            };
        }
        return { tone, text: t('sentence.event', { name: label, detail: attrSummary(row) }), raw };
    }

    const message = row.message?.split('\n')[0]?.trim() || row.title;
    return { tone, text: name ? t('sentence.log', { area: name, message }) : message, raw };
};
