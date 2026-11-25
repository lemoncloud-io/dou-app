import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AVATAR_IMAGE, prepareImage } from '@chatic/shared';
import { runtime } from '@chatic/runtime-react';
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogFooter,
    Input,
    toast,
} from '@chatic/ui-kit';

import {
    avatarStyle,
    FormError,
    FormField,
    isPlaceholderName,
    useAccountName,
    useCurrentPlace,
    useMyProfile,
    useSiteProfilesStore,
    toastFailure,
} from '../../../shared';
import { PlaceChip } from './PlaceChip';
import { useEditPlaceProfileDialogStore } from '../stores';

export const EditPlaceProfileDialog = () => {
    const { t } = useTranslation();
    const isOpen = useEditPlaceProfileDialogStore(s => s.isOpen);
    const close = useEditPlaceProfileDialogStore(s => s.close);
    const { isLoading, isSaving, load, save } = useMyProfile();
    const busy = isLoading || isSaving;
    const { placeName } = useCurrentPlace();
    const placeLabel = placeName || t('profile.thisPlaceFallback');

    const { userId } = runtime.session.useSessionIdentity();
    const { userName, photo } = runtime.session.useRuntimeProfile();
    const myUid = userId ?? '';
    const globalName = isPlaceholderName(userName) ? '' : userName;
    const accountName = useAccountName();
    const globalPhoto = photo ?? '';

    const [nick, setNick] = useState('');
    const [thumbnail, setThumbnail] = useState<string | undefined>(undefined);
    const [isError, setIsError] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const nickRef = useRef<HTMLInputElement>(null);
    const hasActiveProfile = useSiteProfilesStore(s => (myUid ? !!s.profiles[myUid] : false));

    useEffect(() => {
        if (!isOpen) return;
        setIsError(false);
        const cached = myUid ? useSiteProfilesStore.getState().profiles[myUid] : undefined;
        setNick(cached?.nick || globalName);
        setThumbnail(cached?.thumbnail || globalPhoto || undefined);
        void load().then(profile => {
            setNick(profile?.nick || cached?.nick || globalName);
            setThumbnail(profile?.thumbnail || cached?.thumbnail || globalPhoto || undefined);
        });
    }, [isOpen, load, myUid, globalName, globalPhoto]);

    const wasBusy = useRef(busy);
    useEffect(() => {
        if (wasBusy.current && !busy) nickRef.current?.focus();
        wasBusy.current = busy;
    }, [busy]);

    const handleOpenChange = (next: boolean) => {
        if (next) return;
        close();
    };

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const { avatar } = await prepareImage(file, AVATAR_IMAGE);
            if (!avatar) throw new Error('Failed to prepare avatar image');
            setThumbnail(avatar);
        } catch (error) {
            toastFailure(t('profile.place.imageFailed'), error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = nick.trim();
        if (!trimmed || isSaving) return;
        setIsError(false);
        try {
            await save({ nick: trimmed, thumbnail, active: true });
            close();
            toast({ description: t('profile.place.saved') });
        } catch {
            setIsError(true);
        }
    };

    const handleUseAccount = async () => {
        if (isSaving) return;
        setIsError(false);
        try {
            await save({ nick: nick.trim() || globalName || '-', thumbnail, active: false });
            close();
            toast({ description: t('profile.place.reset') });
        } catch {
            setIsError(true);
        }
    };

    const initial = (nick || accountName).charAt(0).toUpperCase() || '?';

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent closeLabel={t('common.close')} className="sm:max-w-md">
                <div className="flex flex-wrap items-center gap-2">
                    <DialogTitle>{t('profile.place.title')}</DialogTitle>
                    {placeName && <PlaceChip name={placeName} />}
                </div>
                <DialogDescription>{t('profile.place.hint', { place: placeLabel })}</DialogDescription>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-14 w-14 rounded-xl">
                            {thumbnail && <AvatarImage src={thumbnail} alt={nick} />}
                            <AvatarFallback
                                className="rounded-xl text-title font-semibold"
                                style={avatarStyle(myUid || nick)}
                            >
                                {initial}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                                {t('profile.place.changePhoto')}
                            </Button>
                            {thumbnail && (
                                <Button type="button" variant="ghost" size="sm" onClick={() => setThumbnail(undefined)}>
                                    {t('profile.place.removePhoto')}
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

                    <FormField
                        label={t('profile.place.nick')}
                        htmlFor="place-nick"
                        errorId="place-nick-error"
                        invalid={isError}
                    >
                        <Input
                            id="place-nick"
                            ref={nickRef}
                            autoFocus
                            value={nick}
                            onChange={e => setNick(e.target.value)}
                            placeholder={accountName || t('profile.place.nick')}
                            disabled={busy}
                        />
                    </FormField>

                    {isError && <FormError id="place-nick-error">{t('profile.place.failed')}</FormError>}

                    {hasActiveProfile && (
                        <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3">
                            <p className="text-micro text-muted-foreground">{t('profile.place.useAccountHint')}</p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="shrink-0"
                                onClick={() => void handleUseAccount()}
                                disabled={busy}
                            >
                                {t('profile.place.useAccount')}
                            </Button>
                        </div>
                    )}

                    <DialogFooter className="gap-2 pt-2 sm:space-x-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={isSaving}
                        >
                            {t('profile.place.cancel')}
                        </Button>
                        <Button type="submit" disabled={busy || !nick.trim()}>
                            {isSaving ? t('profile.place.saving') : t('profile.place.save')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
