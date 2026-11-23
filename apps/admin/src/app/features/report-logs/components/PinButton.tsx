import { useT } from '../../../i18n';
import type { PinKey } from '../lib/pinAxes';

interface PinButtonProps {
    axis: PinKey;
    value?: string;
    active?: boolean;
    onPin: (axis: PinKey, value: string) => void;
    onUnpin?: (axis: PinKey) => void;
    withLabel?: boolean;
    className?: string;
}

export const PinButton = ({
    axis,
    value,
    active = false,
    onPin,
    onUnpin,
    withLabel = false,
    className = '',
}: PinButtonProps) => {
    const { t } = useT('allLogs');
    if (!value) return <span className="text-muted-foreground">-</span>;

    const label = t(`pins.axis.${axis}`);
    const title = active ? t('pins.untrackValue', { axis: label, value }) : t('pins.track', { axis: label, value });

    return (
        <button
            type="button"
            onClick={event => {
                event.stopPropagation();
                if (active) onUnpin?.(axis);
                else onPin(axis, value);
            }}
            title={title}
            className={`inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors ${
                active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground'
            } ${className}`}
        >
            {withLabel && <span className="font-sans text-muted-foreground">{label}</span>}
            <span className="truncate">{value}</span>
            <span aria-hidden>{active ? '×' : '⌖'}</span>
        </button>
    );
};
