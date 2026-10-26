/**
 * `lib/report-logs/timeFormat.ts`
 * - Dates, durations and numbers in the viewer's language, always on Korean time.
 *
 * The people reading this console sit in Korea and talk to users in Korea, so every instant is
 * shown in KST and says so — a time without a zone, read by someone abroad or on a laptop left on
 * another zone, is a time off by hours with nothing on screen to say it. The language changes the
 * words and the order ("10월 26일 14:03" against "Oct 26, 14:03"), never the zone.
 *
 * Built on `Intl`, so there is no table of month names or unit words to keep in two languages.
 */
import { LOCALE_OF, type Language } from '../../../i18n';

export const TIME_ZONE = 'Asia/Seoul';

/** Shown after an absolute time. The zone name is the same word in both languages. */
export const ZONE_LABEL = 'KST';

const cache = new Map<string, Intl.DateTimeFormat>();

const dateFormat = (lng: Language, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => {
    const key = `${lng}|${JSON.stringify(options)}`;
    let format = cache.get(key);
    if (!format) {
        format = new Intl.DateTimeFormat(LOCALE_OF[lng], { timeZone: TIME_ZONE, hourCycle: 'h23', ...options });
        cache.set(key, format);
    }
    return format;
};

const isInstant = (ms?: number): ms is number => typeof ms === 'number' && Number.isFinite(ms);

/** "10월 26일 14:03 KST" · "Oct 26, 14:03 KST". `-` for a missing instant. */
export const formatDateTime = (ms: number | undefined, lng: Language, options?: { seconds?: boolean }): string => {
    if (!isInstant(ms)) return '-';
    const text = dateFormat(lng, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        ...(options?.seconds ? { second: '2-digit' } : {}),
    }).format(ms);
    return `${text} ${ZONE_LABEL}`;
};

/** Clock time alone, "14:03:27", for lines that already sit under a dated heading. */
export const formatClock = (ms: number | undefined, lng: Language): string =>
    isInstant(ms) ? dateFormat(lng, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(ms) : '--:--:--';

/** Hours and minutes alone, "14:03". */
export const formatTime = (ms: number | undefined, lng: Language): string =>
    isInstant(ms) ? dateFormat(lng, { hour: '2-digit', minute: '2-digit' }).format(ms) : '--:--';

/** A calendar day, "10월 26일 (일)" · "Sun, Oct 26". */
export const formatDay = (ms: number | undefined, lng: Language): string =>
    isInstant(ms) ? dateFormat(lng, { month: 'short', day: 'numeric', weekday: 'short' }).format(ms) : '-';

/** "5분 전" · "5 minutes ago"; anything under a minute is "지금" · "now". */
export const formatAgo = (ms: number | undefined, lng: Language, now: number = Date.now()): string => {
    if (!isInstant(ms)) return '-';
    const rtf = new Intl.RelativeTimeFormat(LOCALE_OF[lng], { numeric: 'auto' });
    const diff = ms - now;
    const abs = Math.abs(diff);
    const sign = diff < 0 ? -1 : 1;
    if (abs < 60_000) return rtf.format(0, 'second');
    const minutes = Math.floor(abs / 60_000);
    if (minutes < 60) return rtf.format(sign * minutes, 'minute');
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return rtf.format(sign * hours, 'hour');
    const days = Math.floor(hours / 24);
    if (days < 30) return rtf.format(sign * days, 'day');
    const months = Math.floor(days / 30);
    if (months < 12) return rtf.format(sign * months, 'month');
    return rtf.format(sign * Math.floor(months / 12), 'year');
};

const unit = (lng: Language, name: 'hour' | 'minute' | 'second' | 'millisecond', value: number): string =>
    new Intl.NumberFormat(LOCALE_OF[lng], { style: 'unit', unit: name, unitDisplay: 'narrow' }).format(value);

/** "1시간 5분" · "1h 5m"; seconds below a minute, milliseconds below a second. */
export const formatDuration = (ms: number | undefined, lng: Language): string => {
    if (!isInstant(ms) || ms < 0) return '-';
    if (ms < 1_000) return unit(lng, 'millisecond', Math.round(ms));
    if (ms < 60_000) return unit(lng, 'second', Math.round(ms / 100) / 10);
    const totalMinutes = Math.floor(ms / 60_000);
    if (totalMinutes < 60) {
        const seconds = Math.round((ms % 60_000) / 1_000);
        return seconds
            ? `${unit(lng, 'minute', totalMinutes)} ${unit(lng, 'second', seconds)}`
            : unit(lng, 'minute', totalMinutes);
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${unit(lng, 'hour', hours)} ${unit(lng, 'minute', minutes)}` : unit(lng, 'hour', hours);
};

/** Grouped digits in the viewer's language. */
export const formatNumber = (value: number, lng: Language, maximumFractionDigits = 0): string =>
    new Intl.NumberFormat(LOCALE_OF[lng], { maximumFractionDigits }).format(value);
