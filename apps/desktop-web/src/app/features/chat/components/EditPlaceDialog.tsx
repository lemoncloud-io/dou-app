import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ImagePlus } from 'lucide-react';

import { logger } from '@chatic/bridges';
import type { DomainPlace } from '@chatic/runtime-react';
import { AVATAR_IMAGE, prepareImage } from '@chatic/shared';
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
    Input,
    Label,
    toast,
} from '@chatic/ui-kit';

import { useUpdatePlace, toastFailure } from '../../../shared';
import { useEditPlaceDialogStore } from '../stores';
import { PLACE_DESC_MAX, PLACE_IMAGE_MAX_BYTES, PLACE_NAME_MAX, placeFailure, type PlaceFailure } from '../utils';

type Failure = PlaceFailure | 'imageTooLarge' | 'imageFailed';

const FAILURE_KEY: Record<Failure, string> = {
    denied: 'place.edit.failed.denied',
    network: 'errors.network',
    other: 'place.edit.failed',
    imageTooLarge: 'place.create.imageTooLarge',
    imageFailed: 'place.create.imageFailed',
};

const IMAGE_MAX_MB = PLACE_IMAGE_MAX_BYTES / (1024 * 1024);

interface EditPlaceDialogProps {
    places: readonly DomainPlace[];
}

export const EditPlaceDialog = ({ places }: EditPlaceDialogProps) => {
    const { t } = useTranslation();
    const placeId = useEditPlaceDialogStore(s => s.placeId);
    const close = useEditPlaceDialogStore(s => s.close);
    const { updatePlace } = useUpdatePlace();
    const place = placeId ? places.find(p => p.id === placeId) : undefined;
    const isOpen = !!place;

    const [name, setName] = useState('');
    const [thumbnail, setThumbnail] = useState<string | undefined>(undefined);
    const [desc, setDesc] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    const [encoding, setEncoding] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [failure, setFailure] = useState<Failure | null>(null);

    const session = useRef(0);

    useEffect(() => {
        if (placeId && !place) close();
    }, [placeId, place, close]);

    useEffect(() => {
        session.current += 1;
        setName(place?.name ?? '');
        setDesc(place?.desc ?? '');
        setThumbnail(place?.thumbnail || undefined);
        setEncoding(false);
        setSubmitting(false);
        setFailure(null);
    }, [place?.id]);

    const trimmed = name.trim();
    const nameChanged = !!place && trimmed !== (place.name ?? '').trim();
    const photoChanged = !!place && thumbnail !== (place.thumbnail || undefined);
    const descChanged = !!place && desc.trim() !== (place.desc ?? '').trim();
    const canSave = !!trimmed && (nameChanged || photoChanged || descChanged) && !submitting && !encoding;

    const handleOpenChange = (next: boolean) => {
        if (next || submitting) return;
        close();
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
            logger.warn('PLACE', '[EditPlace] image failed', { error });
            if (session.current === startedIn) setFailure('imageFailed');
        } finally {
            if (session.current === startedIn) setEncoding(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!place || !canSave) return;
        setSubmitting(true);
        setFailure(null);
        const startedIn = session.current;
        try {
            await updatePlace({
                id: place.id,
                ...(nameChanged && { name: trimmed }),
                ...(photoChanged && { thumbnail: thumbnail ?? '' }),
                ...(descChanged && { desc: desc.trim() }),
            });
        } catch (error) {
            const reason = placeFailure(error, 'EditPlace');
            if (session.current !== startedIn) return;
            setFailure(reason);
            toastFailure(t(FAILURE_KEY[reason], { max: IMAGE_MAX_MB }), error);
            setSubmitting(false);
            return;
        }
        if (session.current !== startedIn) return;
        close();
        toast({ description: t('place.edit.saved') });
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent closeLabel={t('common.close')} className="sm:max-w-md">
                <DialogTitle>{t('place.edit.title')}</DialogTitle>
                <DialogDescription>{t('place.edit.description')}</DialogDescription>
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
                                disabled={submitting || encoding}
                                onClick={() => fileRef.current?.click()}
                            >
                                {t(thumbnail ? 'place.create.changePhoto' : 'place.create.photo')}
                            </Button>
                            {thumbnail && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={submitting || encoding}
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
                        <Label htmlFor="edit-place-name">{t('place.create.nameLabel')}</Label>
                        <Input
                            id="edit-place-name"
                            autoFocus
                            value={name}
                            maxLength={PLACE_NAME_MAX}
                            onChange={e => setName(e.target.value)}
                            placeholder={t('place.create.namePlaceholder')}
                            disabled={submitting}
                            aria-describedby="edit-place-name-hint"
                        />
                        <p id="edit-place-name-hint" className="text-micro text-muted-foreground">
                            {t('place.create.nameHint', { max: PLACE_NAME_MAX })}
                        </p>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="edit-place-desc">{t('place.edit.descLabel')}</Label>
                        <Input
                            id="edit-place-desc"
                            value={desc}
                            maxLength={PLACE_DESC_MAX}
                            onChange={e => setDesc(e.target.value)}
                            placeholder={t('place.edit.descPlaceholder')}
                            disabled={submitting}
                            aria-describedby="edit-place-desc-hint"
                        />
                        <p id="edit-place-desc-hint" className="text-micro text-muted-foreground">
                            {t('place.edit.descHint', { max: PLACE_DESC_MAX })}
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
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={!canSave}>
                            {submitting ? t('place.edit.saving') : t('place.edit.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
