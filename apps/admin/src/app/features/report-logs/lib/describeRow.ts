/**
 * `lib/report-logs/describeRow.ts`
 * - A record as a sentence someone outside engineering can read: "채팅 · 메시지 전송 실패" rather
 *   than `[CHAT] error send failed {"code":…}`.
 *
 * The sentence is made from the record's own words — the area's display name and the message the
 * app wrote. Messages are not translated (they are the app's diagnostic text, and the raw form is
 * what an engineer will search for), but the frame around them is, and so are the names of the
 * areas and statistics. The raw tag stays available for a tooltip.
 */
import type { TFunction } from 'i18next';

import type { Language } from '../../../i18n';
import { EVENT_NAMES } from '../../../i18n/locales';
import { areaOfTag, type ReportLogRow } from './parseReportLog';
import { recordKindOf } from './recordKinds';
import { formatDuration } from './timeFormat';

/** How a line is emphasised: errors red, reports blue, warnings amber, the rest plain. */
export type Tone = 'error' | 'report' | 'warn' | 'plain' | 'stat';

export interface RowSentence {
    tone: Tone;
    text: string;
    /** The raw tag, for a tooltip. */
    raw?: string;
}

const own = (map: Record<string, string>, key: string | undefined): string | undefined =>
    key !== undefined && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;

/** Display name of a tag: the tag itself when named, else its area, else nothing. */
export const eventNameOf = (tag: string | undefined, lng: Language): string | undefined => {
    if (!tag) return undefined;
    const names = EVENT_NAMES[lng];
    return own(names.tags, tag) ?? own(names.areas, areaOfTag(tag));
};

/** Display name for an error group's heading: the name when there is one, else the raw tag. */
export const eventLabelOf = (tag: string, lng: Language): string => eventNameOf(tag, lng) ?? tag;

export const toneOf = (row: ReportLogRow): Tone => {
    if (row.type === 'issue') return 'report';
    if (row.type === 'error' || row.level === 'error') return 'error';
    if (recordKindOf(row) !== 'log') return 'stat';
    if (row.level === 'warn') return 'warn';
    return 'plain';
};

/** `screen=/chat` and friends, on one line, for a statistic without a sentence of its own. */
const attrSummary = (row: ReportLogRow): string =>
    Object.entries(row.attrs ?? {})
        .map(([key, value]) => `${key}=${value}`)
        .join(' · ');

/**
 * The sentence for one record. `t` is bound to the `user` namespace, which holds the frames.
 */
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
