import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';

import { CHANNEL_NAME_MAX } from '../utils';

interface ChannelNameFieldProps {
    id: string;
    label: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    /**
     * The form was submitted with a name out of range. Enter on a one-character
     * name used to do nothing at all; the length rule now turns into the error.
     */
    showInvalid: boolean;
}

/** Name input shared by the create and rename dialogs: length rule, counter, error state. */
export const ChannelNameField = ({
    id,
    label,
    placeholder,
    value,
    onChange,
    disabled,
    showInvalid,
}: ChannelNameFieldProps) => {
    const { t } = useTranslation();
    const hintId = `${id}-hint`;
    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                autoFocus
                value={value}
                maxLength={CHANNEL_NAME_MAX}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                aria-invalid={showInvalid || undefined}
                aria-describedby={hintId}
            />
            <div className="flex items-baseline justify-between gap-2">
                <p
                    id={hintId}
                    role={showInvalid ? 'alert' : undefined}
                    className={cn('text-xs', showInvalid ? 'text-destructive' : 'text-muted-foreground')}
                >
                    {t('channels.rename.lengthHint')}
                </p>
                {/* The input truncates silently at the maximum; a counter is
                    what tells someone their last keystrokes went nowhere. */}
                <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {t('channels.nameCount', { count: value.trim().length, max: CHANNEL_NAME_MAX })}
                </p>
            </div>
        </div>
    );
};
