/**
 * `lib/stats.ts`
 * - Socket Monitor 공용 통계/색/포맷 헬퍼. 디자인(dc.html) 헬퍼 수식 그대로 포팅.
 */
import type { Presence } from '../mock/observed-users';

/** 테마 악센트(teal). Phase 1 고정. */
export const ACCENT = '#2dd4bf';

/** hex → rgba 문자열. 3자리 hex 확장 지원. */
export const hexToRgba = (hex: string, a: number): string => {
    let h = (hex || ACCENT).replace('#', '');
    if (h.length === 3) {
        h = h
            .split('')
            .map(c => c + c)
            .join('');
    }
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** 정렬 후 floor 인덱싱 분위수(디자인 패리티). 빈 배열은 0. */
export const pct = (arr: number[], p: number): number => {
    if (!arr || !arr.length) return 0;
    const a = [...arr].sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
};

export const presenceColor = (p: Presence): string =>
    p === 'red' ? '#f85149' : p === 'yellow' ? '#d29922' : '#3fb950';

/** 초 → 사람이 읽는 기간 문자열. */
export const dur = (s: number): string => {
    s = Math.max(0, Math.round(s));
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
};

export const ago = (s: number): string => dur(s) + ' ago';

export type MetricKey = 'fanout' | 'rtt' | 'send' | 'handshake' | 'loss' | 'catchup' | 'reconnect';
export type SliStatus = 'green' | 'yellow' | 'red';

/** SLI 임계치 [warn, crit]. */
export const THRESHOLDS: Record<MetricKey, [number, number]> = {
    fanout: [90, 180],
    rtt: [140, 280],
    send: [80, 160],
    handshake: [350, 600],
    loss: [1, 3],
    catchup: [300, 600],
    reconnect: [1500, 3000],
};

export const statusOf = (k: MetricKey, v: number): SliStatus => {
    const t = THRESHOLDS[k];
    return v > t[1] ? 'red' : v > t[0] ? 'yellow' : 'green';
};

export const statusColor = (st: SliStatus): string =>
    st === 'red' ? '#f85149' : st === 'yellow' ? '#d29922' : '#3fb950';
