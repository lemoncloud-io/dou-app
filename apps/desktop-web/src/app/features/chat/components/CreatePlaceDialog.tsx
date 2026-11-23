import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ImagePlus } from 'lucide-react';

import { logger } from '@chatic/bridges';
import { AVATAR_IMAGE, prepareImage } from '@chatic/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Button } from '@chatic/ui-kit/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { useCreatePlace, toastFailure } from '../../../shared';
import { useCreatePlaceDialogStore } from '../stores';
import { PLACE_IMAGE_MAX_BYTES, PLACE_NAME_MAX, placeFailure, type PlaceFailure } from '../utils';

type Failure = PlaceFailure | 'enter' | 'imageTooLarge' | 'imageFailed';

const FAILURE_KEY: Record<Failure, string> = {
    denied: 'place.create.failed.denied',
    network: 'errors.network',
    other: 'place.create.failed',
    enter: 'place.create.enterFailed',
    imageTooLarge: 'place.create.imageTooLarge',
    imageFailed: 'place.create.imageFailed',
};

const IMAGE_MAX_MB = PLACE_IMAGE_MAX_BYTES / (1024 * 1024);

interface CreatePlaceDialogProps {
    onEnter: (placeId: string) => Promise<void>;
    onEntered?: (placeId: string) => void;
}

export const CreatePlaceDialog = ({ onEnter, onEntered }: CreatePlaceDialogProps) => {
    const { t } = useTranslation();
    const isOpen = useCreatePlaceDialogStore(s => s.isOpen);
    const setOpen = useCreatePlaceDialogStore(s => s.setOpen);
    const { createPlace } = useCreatePlace();

    const [name, setName] = useState('');
    const [thumbnail, setThumbnail] = useState<string | undefined>(undefined);
    const fileRef = useRef<HTMLInputElement>(null);
    const [encoding, setEncoding] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [failure, setFailure] = useState<Failure | null>(null);
    const [unenteredPlaceId, setUnenteredPlaceId] = useState<string | null>(null);

    const trimmed = name.trim();

    const session = useRef(0);

    useEffect(() => {
        if (isOpen) return;
        session.current += 1;
        setName('');
        setThumbnail(undefined);
        setEncoding(false);
        setSubmitting(false);
        setFailure(null);
        setUnenteredPlaceId(null);
    }, [isOpen]);

    const handleOpenChange = (next: boolean) => {
        if (next || submitting) return;
        setOpen(false);
    };

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setFailure(null);
        if (file.size > PLACE_IMAGE_MAX_BYTES) {
            setFailure('imageTooLarge');
            return;
        }
        const startedIn = session.current;
        setEncoding(true);
        try {
            const { avatar } = await prepareImage(file, AVATAR_IMAGE);
            if (!avatar) throw new Error('Failed to prepare place image');
            if (session.current === startedIn) setThumbnail(avatar);
        } catch (error) {
            logger.warn('PLACE', '[CreatePlace] image failed', { error });
            if (session.current === startedIn) setFailure('imageFailed');
        } finally {
            if (session.current === startedIn) setEncoding(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting || encoding || !trimmed) return;
        setSubmitting(true);
        setFailure(null);
        const startedIn = session.current;
        const closed = () => session.current !== startedIn || !useCreatePlaceDialogStore.getState().isOpen;

        let placeId = unenteredPlaceId;
        if (!placeId) {
            try {
                placeId = (await createPlace({ name: trimmed, thumbnail })).id;
                if (closed()) return;
                setUnenteredPlaceId(placeId);
            } catch (error) {
                const reason = placeFailure(error, 'CreatePlace');
                if (closed()) return;
                setFailure(reason);
                toastFailure(t(FAILURE_KEY[reason], { max: IMAGE_MAX_MB }), error);
                setSubmitting(false);
                return;
            }
        }

        try {
            await onEnter(placeId);
        } catch (error) {
            logger.error('PLACE', '[CreatePlace] enter failed', { error, placeId });
            if (closed()) return;
            setFailure('enter');
            toastFailure(t(FAILURE_KEY.enter), error);
            setSubmitting(false);
            return;
        }

        if (closed()) return;
        setOpen(false);
        toast({ description: t('place.create.created') });
        onEntered?.(placeId);
    };

    const locked = submitting || unenteredPlaceId !== null;

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent closeLabel={t('common.close')} className="sm:max-w-md">
                <DialogTitle>{t('place.create.title')}</DialogTitle>
                <DialogDescription>{t('place.create.description')}</DialogDescription>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-14 w-14 rounded-xl">
                            {thumbnail && <AvatarImage src={thumbnail} alt={trimmed} />}
                            <AvatarFallback className="rounded-xl bg-muted text-muted-foreground">
                                <ImagePlus className="h-5 w-5" aria-hidden />
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={locked || encoding}
                                onClick={() => fileRef.current?.click()}
                            >
                                {t(thumbnail ? 'place.create.changePhoto' : 'place.create.photo')}
                            </Button>
                            {thumbnail && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={locked || encoding}
                                    onClick={() => setThumbnail(undefined)}
                                >
                                    {t('place.create.removePhoto')}
                                </Button>
                            )}
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => void handleFile(e)}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="place-name">{t('place.create.nameLabel')}</Label>
                        <Input
                            id="place-name"
                            autoFocus
                            value={name}
                            maxLength={PLACE_NAME_MAX}
                            onChange={e => setName(e.target.value)}
                            placeholder={t('place.create.namePlaceholder')}
                            disabled={locked}
                            aria-describedby="place-name-hint"
                        />
                        <p id="place-name-hint" className="text-micro text-muted-foreground">
                            {t('place.create.nameHint', { max: PLACE_NAME_MAX })}
                        </p>
                    </div>

                    {failure && (
                        <p role="alert" className="text-callout text-destructive">
                            {t(FAILURE_KEY[failure], { max: IMAGE_MAX_MB })}
                        </p>
                    )}

                    <DialogFooter className="gap-2 pt-2 sm:space-x-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={submitting}
                        >
                            {t('place.create.cancel')}
                        </Button>
                        <Button type="submit" disabled={submitting || encoding || !trimmed}>
                            {submitting ? t('place.create.creating') : t('place.create.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
