/**
 * `components/report-logs/TrackingPins.tsx`
 * - The active tracking context, shown as chips above everything else.
 *
 * A pin is a server-side narrowing, so it changes what the whole screen is about — every
 * count, every facet, every chart below it is scoped to these values. That is why they sit
 * at the top as a persistent statement of context rather than inside the filter rail with
 * the client-side narrowings.
 */
import { PIN_LABEL, type PinKey } from '../lib/pinAxes';

interface TrackingPinsProps {
    pins: Array<{ key: PinKey; value: string }>;
    onUnpin: (key: PinKey) => void;
    /**
     * Set when a pinned `uid` cannot reach the user's own issue reports — Slack reports
     * are not stamped with a `uid`, so the filter only matches batch log entries.
     */
    uidCaveat?: boolean;
}

export const TrackingPins = ({ pins, onUnpin, uidCaveat = false }: TrackingPinsProps) => {
    if (pins.length === 0) return null;

    const hasUid = pins.some(pin => pin.key === 'uid');

    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">추적 중</span>
            {pins.map(pin => (
                <span
                    key={pin.key}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs text-primary"
                >
                    <span className="text-primary/70">{PIN_LABEL[pin.key]}</span>
                    <span className="font-mono">{pin.value}</span>
                    <button
                        type="button"
                        onClick={() => onUnpin(pin.key)}
                        aria-label={`${PIN_LABEL[pin.key]} 추적 해제`}
                        className="rounded-full px-1 leading-none hover:bg-primary/20"
                    >
                        ×
                    </button>
                </span>
            ))}
            {hasUid && uidCaveat && (
                <span className="text-[11px] text-muted-foreground">
                    · 제보 레코드는 uid 축이 없어 이 핀에 걸리지 않습니다
                </span>
            )}
        </div>
    );
};
