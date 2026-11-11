/**
 * `components/report-logs/PinButton.tsx`
 * - A value plus the affordance to pin it, used wherever a `uid`/`cid`/`runId` appears.
 *
 * These three are the only axes the backend can filter on that identify *who* or *which
 * run* (`saveLogEntry` hoists them; nothing else about a log is queryable). So pinning is
 * not a convenience over an existing search — it is the one mechanism that turns a value
 * spotted in a row into a query over the whole dataset. That is why the affordance sits
 * on the value itself, in both the list and the detail panel, rather than in a filter box
 * the operator would have to copy into.
 */
import { useT } from '../../../i18n';
import type { PinKey } from '../lib/pinAxes';

interface PinButtonProps {
    axis: PinKey;
    value?: string;
    /** True when this exact axis is already pinned — the button then unpins. */
    active?: boolean;
    onPin: (axis: PinKey, value: string) => void;
    onUnpin?: (axis: PinKey) => void;
    /** Show the axis name before the value. Off in the list, where the column says it. */
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
            // The row underneath opens the detail panel; pinning is a different intent.
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
