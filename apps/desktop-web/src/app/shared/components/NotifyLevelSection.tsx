import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';

import { notifyModesFor, type ChannelNotifyMode } from '../stores';
import { radioGroupOptions } from '../utils';
import { SettingsNavRow, SettingsRowGroup } from './SettingsRow';

const MODES = notifyModesFor(false);

/**
 * A notification level for many channels at once — a place, or a whole cloud. The same three
 * levels a channel offers, drawn as the channel panel draws them; `mode` is null when the channels
 * it covers differ and nobody chose a level for them, so no option is checked. The exceptions row
 * names how many channels are set differently and leads to where they are changed one by one.
 */
export const NotifyLevelSection = ({
    title,
    hint,
    mode,
    onSelect,
    exceptions = 0,
    onOpenExceptions,
}: {
    title: string;
    hint: string;
    mode: ChannelNotifyMode | null;
    onSelect: (mode: ChannelNotifyMode) => void;
    exceptions?: number;
    onOpenExceptions?: () => void;
}) => {
    const { t } = useTranslation();
    const optionProps = radioGroupOptions(MODES, mode, onSelect);

    return (
        <SettingsRowGroup>
            <div className="flex flex-col gap-3 px-5 py-4">
                <div className="flex flex-col gap-0.5">
                    <span className="text-callout font-medium text-foreground">{title}</span>
                    <span className="text-caption text-muted-foreground">{hint}</span>
                </div>
                <div
                    role="radiogroup"
                    aria-label={title}
                    className="flex rounded-lg border border-hairline bg-well p-0.5"
                >
                    {MODES.map(option => (
                        <button
                            key={option}
                            type="button"
                            {...optionProps(option)}
                            className={cn(
                                'focus-ring tactile flex-1 rounded-md px-2 py-1.5 text-caption font-medium transition-colors ease-tactile',
                                mode === option
                                    ? 'bg-elevated text-foreground shadow-raised'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {t(`channels.settings.notify.${option}`)}
                        </button>
                    ))}
                </div>
            </div>
            {exceptions > 0 && onOpenExceptions && (
                <SettingsNavRow
                    label={t('place.settings.notify.exceptions', { count: exceptions })}
                    onClick={onOpenExceptions}
                />
            )}
        </SettingsRowGroup>
    );
};
