import { useT } from '../../../i18n';
import type { PinKey } from '../lib/pinAxes';

interface TrackingPinsProps {
    pins: Array<{ key: PinKey; value: string }>;
    onUnpin: (key: PinKey) => void;
    uidCaveat?: boolean;
}

export const TrackingPins = ({ pins, onUnpin, uidCaveat = false }: TrackingPinsProps) => {
    const { t } = useT('allLogs');
    if (pins.length === 0) return null;

    const hasUid = pins.some(pin => pin.key === 'uid');

    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('pins.tracking')}</span>
            {pins.map(pin => (
                <span
                    key={pin.key}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs text-primary"
                >
                    <span className="text-primary/70">{t(`pins.axis.${pin.key}`)}</span>
                    <span className="font-mono">{pin.value}</span>
                    <button
                        type="button"
                        onClick={() => onUnpin(pin.key)}
                        aria-label={t('pins.untrack', { axis: t(`pins.axis.${pin.key}`) })}
                        className="rounded-full px-1 leading-none hover:bg-primary/20"
                    >
                        ×
                    </button>
                </span>
            ))}
            {hasUid && uidCaveat && <span className="text-[11px] text-muted-foreground">{t('pins.uidCaveat')}</span>}
        </div>
    );
};
