import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogFooter,
} from '@chatic/ui-kit/components/ui/dialog';

import { useDesktopChannelMutations } from '../../../shared';
import { useCreateChannelDialogStore } from '../stores';
import { isValidChannelName } from '../utils';
import { ChannelNameField } from './ChannelNameField';

type Visibility = 'public' | 'private';

interface CreateChannelDialogProps {
    /**
     * Open the new channel. Selecting it here raced the channel list: the id was
     * not in it yet, so the host's auto-select put the previous channel back.
     */
    onCreated: (channelId: string) => void;
}

export const CreateChannelDialog = ({ onCreated }: CreateChannelDialogProps) => {
    const { t } = useTranslation();
    const isOpen = useCreateChannelDialogStore(s => s.isOpen);
    const close = useCreateChannelDialogStore(s => s.close);
    const { createChannel, isMutating } = useDesktopChannelMutations();

    const [name, setName] = useState('');
    const [visibility, setVisibility] = useState<Visibility>('public');
    const [isError, setIsError] = useState(false);
    const [showInvalid, setShowInvalid] = useState(false);

    const reset = () => {
        setName('');
        setVisibility('public');
        setIsError(false);
        setShowInvalid(false);
    };

    const handleOpenChange = (next: boolean) => {
        if (next) return;
        reset();
        close();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (isMutating) return;
        if (!isValidChannelName(trimmed)) {
            setShowInvalid(true);
            return;
        }
        setIsError(false);
        try {
            const channel = await createChannel({ stereo: visibility, name: trimmed });
            if (channel.id) onCreated(channel.id);
            reset();
            close();
            toast({ description: t('toast.channelCreated') });
        } catch {
            setIsError(true);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent closeLabel={t('common.close')} className="sm:max-w-md">
                <DialogTitle>{t('channels.create.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('channels.create.title')}</DialogDescription>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
                    <ChannelNameField
                        id="channel-name"
                        label={t('channels.create.nameLabel')}
                        placeholder={t('channels.create.namePlaceholder')}
                        value={name}
                        onChange={value => {
                            setName(value);
                            setShowInvalid(false);
                        }}
                        disabled={isMutating}
                        showInvalid={showInvalid}
                    />

                    <div className="flex flex-col gap-1.5">
                        <span id="create-channel-visibility">{t('channels.create.visibility')}</span>
                        {/* A naked Public/Private pair says nothing about what either
                            does, so each option carries its own consequence line. */}
                        <div role="radiogroup" aria-labelledby="create-channel-visibility" className="flex gap-2">
                            {(['public', 'private'] as const).map(option => (
                                <button
                                    key={option}
                                    type="button"
                                    role="radio"
                                    aria-checked={visibility === option}
                                    onClick={() => setVisibility(option)}
                                    className={cn(
                                        'focus-ring flex flex-1 flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                                        visibility === option
                                            ? 'border-primary bg-primary/10 font-semibold text-foreground'
                                            : 'border-input text-muted-foreground hover:bg-accent/50'
                                    )}
                                >
                                    {t(`channels.create.${option}`)}
                                    <span className="text-xs font-normal text-muted-foreground">
                                        {t(`channels.create.${option}.hint`)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {isError && (
                        <p role="alert" className="text-sm text-destructive">
                            {t('channels.create.failed')}
                        </p>
                    )}

                    <DialogFooter className="gap-2 pt-2 sm:space-x-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={isMutating}
                        >
                            {t('channels.create.cancel')}
                        </Button>
                        <Button type="submit" disabled={isMutating || name.trim().length === 0}>
                            {isMutating ? t('channels.create.creating') : t('channels.create.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
