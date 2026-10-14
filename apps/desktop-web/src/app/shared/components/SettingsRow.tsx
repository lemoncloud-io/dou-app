import { useId, type ReactNode } from 'react';

import { ChevronRight } from 'lucide-react';

import { Switch } from '@chatic/ui-kit/components/ui/switch';

const GROUP = 'overflow-hidden rounded-xl border border-border bg-card divide-y divide-border';

/**
 * One hairline-grouped row for the settings and account surfaces. Three shapes
 * share the row metrics so ~14 equal-weight "title + hint + open" cards read
 * as one list instead:
 *
 * - `SettingsNavRow`: a whole-row hit target with a chevron, for entries that
 *   lead somewhere (clouds, policies, the Account hub).
 * - `SettingsSwitchRow`: a label bound to its switch by `htmlFor`, for toggles.
 *   The label text alone used to do nothing — neither announced with the
 *   switch nor clickable.
 * - `SettingsActionRow`: a label with an arbitrary action (a destructive
 *   button, a version line), for rows that are neither navigation nor a switch.
 */
export const SettingsRowGroup = ({ children }: { children: ReactNode }) => <div className={GROUP}>{children}</div>;

export const SettingsNavRow = ({ label, hint, onClick }: { label: string; hint?: ReactNode; onClick: () => void }) => (
    <button
        type="button"
        onClick={onClick}
        className="focus-ring tactile flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-accent"
    >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-callout font-medium text-foreground">{label}</span>
            {hint != null && <span className="text-caption text-muted-foreground">{hint}</span>}
        </span>
        <ChevronRight size={16} aria-hidden className="shrink-0 text-muted-foreground" />
    </button>
);

export const SettingsSwitchRow = ({
    label,
    hint,
    hintId,
    describedBy,
    checked,
    onCheckedChange,
    disabled,
    children,
}: {
    label: string;
    hint?: ReactNode;
    /** Override the hint node id when a caller references it (error swaps). */
    hintId?: string;
    describedBy?: string;
    checked: boolean;
    onCheckedChange: (on: boolean) => void;
    disabled?: boolean;
    /** Extra content under the label (inputs, errors, sub-switches). */
    children?: ReactNode;
}) => {
    const labelId = useId();
    const autoHintId = useId();
    const switchId = useId();
    const hintNodeId = hintId ?? autoHintId;

    return (
        <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <label
                    htmlFor={switchId}
                    id={labelId}
                    className="w-fit cursor-pointer text-callout font-medium text-foreground"
                >
                    {label}
                </label>
                {hint != null && (
                    <span id={hintNodeId} className="text-caption text-muted-foreground">
                        {hint}
                    </span>
                )}
                {children}
            </div>
            <Switch
                id={switchId}
                className="hit-target shrink-0"
                checked={checked}
                onCheckedChange={onCheckedChange}
                disabled={disabled}
                aria-describedby={describedBy ?? (hint != null ? hintNodeId : undefined)}
            />
        </div>
    );
};

export const SettingsActionRow = ({ label, hint, action }: { label: string; hint?: ReactNode; action: ReactNode }) => (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-callout font-medium text-foreground">{label}</span>
            {hint != null && <span className="text-caption text-muted-foreground">{hint}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">{action}</div>
    </div>
);
