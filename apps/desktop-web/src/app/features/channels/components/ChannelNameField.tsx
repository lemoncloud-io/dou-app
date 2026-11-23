import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
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
    showInvalid: boolean;
}

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
                    className={cn('text-micro', showInvalid ? 'text-destructive' : 'text-muted-foreground')}
                >
                    {t('channels.rename.lengthHint')}
                </p>
                <p className="shrink-0 text-micro tabular-nums text-muted-foreground">
                    {t('channels.nameCount', { count: value.trim().length, max: CHANNEL_NAME_MAX })}
                </p>
            </div>
        </div>
    );
};
