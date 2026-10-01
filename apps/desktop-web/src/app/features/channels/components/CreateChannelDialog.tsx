import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@chatic/ui-kit/components/ui/dialog';

import { MobileAppPointer, radioGroupOptions, useDesktopChannelMutations } from '../../../shared';
import { useCreateChannelDialogStore } from '../stores';
import { createChannelFailure, isValidChannelName, type CreateChannelFailure } from '../utils';
import { ChannelNameField } from './ChannelNameField';

type Visibility = 'public' | 'private';

// Only the failures a second try can fix say "try again"; a full place or a refusal says what it is.
const FAILURE_KEY: Record<CreateChannelFailure, string> = {
    limit: 'channels.create.failed.limit',
    denied: 'channels.create.failed.denied',
    network: 'errors.network',
    other: 'channels.create.failed',
};

const VISIBILITIES: readonly Visibility[] = ['public', 'private'];

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
    const [failure, setFailure] = useState<CreateChannelFailure | null>(null);
    const [showInvalid, setShowInvalid] = useState(false);

    const visibilityProps = radioGroupOptions(VISIBILITIES, visibility, setVisibility);

    const reset = () => {
        setName('');
        setVisibility('public');
        setFailure(null);
        setShowInvalid(false);
    };

    const handleOpenChange = (next: boolean) => {
        // Escape, the X and the backdrop are ignored while the channel is being created, as in
        // Rename and AddMembers: closing then would drop a failure message with nobody to read it.
        if (next || isMutating) return;
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
        setFailure(null);
        try {
            const channel = await createChannel({ stereo: visibility, name: trimmed });
            if (channel.id) onCreated(channel.id);
            reset();
            close();
            toast({ description: t('toast.channelCreated') });
        } catch (error) {
            setFailure(createChannelFailure(error));
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            {/* No description: the title and the field's own label and hint say it all, and a
                hidden copy of the title made a screen reader read it twice. `undefined` is
                Radix's opt-out from its missing-description warning. */}
            <DialogContent closeLabel={t('common.close')} aria-describedby={undefined} className="sm:max-w-md">
                <DialogTitle>{t('channels.create.title')}</DialogTitle>
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
                            {VISIBILITIES.map(option => (
                                <button
                                    key={option}
                                    type="button"
                                    {...visibilityProps(option)}
                                    className={cn(
                                        'focus-ring flex flex-1 flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-callout transition-colors',
                                        visibility === option
                                            ? 'border-primary-ink bg-primary/10 font-semibold text-foreground'
                                            : 'border-control-border text-muted-foreground hover:bg-accent/50'
                                    )}
                                >
                                    {t(`channels.create.${option}`)}
                                    <span className="text-micro font-normal text-muted-foreground">
                                        {t(`channels.create.${option}.hint`)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {failure && (
                        <div role="alert" className="flex flex-col gap-1">
                            <p className="text-callout text-destructive">{t(FAILURE_KEY[failure])}</p>
                            {failure === 'limit' && <MobileAppPointer />}
                        </div>
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
