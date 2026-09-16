import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';

import { useDesktopChannelMutations, useSelectedChannelStore } from '../../../shared';
import { useCreateChannelDialogStore } from '../stores';
import { CHANNEL_NAME_MAX, isValidChannelName } from '../utils';

type Visibility = 'public' | 'private';

export const CreateChannelDialog = () => {
    const { t } = useTranslation();
    const isOpen = useCreateChannelDialogStore(s => s.isOpen);
    const close = useCreateChannelDialogStore(s => s.close);
    const selectChannel = useSelectedChannelStore(s => s.selectChannel);
    const { createChannel, isMutating } = useDesktopChannelMutations();

    const [name, setName] = useState('');
    const [visibility, setVisibility] = useState<Visibility>('public');
    const [isError, setIsError] = useState(false);

    const reset = () => {
        setName('');
        setVisibility('public');
        setIsError(false);
    };

    const handleOpenChange = (next: boolean) => {
        if (next) return;
        reset();
        close();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!isValidChannelName(trimmed) || isMutating) return;
        setIsError(false);
        try {
            const channel = await createChannel({ stereo: visibility, name: trimmed });
            if (channel.id) selectChannel(channel.id);
            reset();
            close();
            toast({ description: t('toast.channelCreated') });
        } catch {
            setIsError(true);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogTitle>{t('channels.create.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('channels.create.title')}</DialogDescription>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="channel-name">{t('channels.create.nameLabel')}</Label>
                        <Input
                            id="channel-name"
                            autoFocus
                            value={name}
                            maxLength={CHANNEL_NAME_MAX}
                            onChange={e => setName(e.target.value)}
                            placeholder={t('channels.create.namePlaceholder')}
                            disabled={isMutating}
                        />
                        <p className="text-xs text-muted-foreground">{t('channels.rename.lengthHint')}</p>
                    </div>

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

                    {isError && <p className="text-sm text-destructive">{t('channels.create.failed')}</p>}

                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => handleOpenChange(false)}
                            disabled={isMutating}
                        >
                            {t('channels.create.cancel')}
                        </Button>
                        <Button type="submit" disabled={isMutating || !name.trim()}>
                            {isMutating ? t('channels.create.creating') : t('channels.create.submit')}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
