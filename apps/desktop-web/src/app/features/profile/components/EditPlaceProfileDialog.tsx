import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { resizeImageToBase64 } from '@chatic/shared';
import { useWebCoreStore } from '@chatic/web-core';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { Switch } from '@chatic/ui-kit/components/ui/switch';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { avatarStyle, isPlaceholderName, useCurrentPlace, useMyProfile, useSiteProfilesStore } from '../../../shared';
import { PlaceChip } from './PlaceChip';
import { useEditPlaceProfileDialogStore } from '../stores';

const THUMBNAIL_SIZE = 150;

/**
 * Edit my Place Profile (nick / thumbnail / active) for the current place. The
 * save is optimistic in the repository, so my own name + avatar flip instantly
 * across messages, roster and self surfaces. Seeds from the loaded Place Profile,
 * falling back to my Global Profile when none exists (or load fails — fail-soft).
 */
export const EditPlaceProfileDialog = () => {
    const { t } = useTranslation();
    const isOpen = useEditPlaceProfileDialogStore(s => s.isOpen);
    const close = useEditPlaceProfileDialogStore(s => s.close);
    const { isLoading, isSaving, load, save } = useMyProfile();
    const busy = isLoading || isSaving;
    const { placeName } = useCurrentPlace();
    const placeLabel = placeName || t('profile.thisPlaceFallback');

    const myUid = useWebCoreStore(s => s.profile?.uid ?? '');
    const rawName = useWebCoreStore(s => s.profile?.$user?.name ?? '');
    const globalName = isPlaceholderName(rawName) ? '' : rawName;
    const globalPhoto = useWebCoreStore(s => s.profile?.$user?.photo ?? '');

    const [nick, setNick] = useState('');
    const [thumbnail, setThumbnail] = useState<string | undefined>(undefined);
    const [active, setActive] = useState(false);
    const [isError, setIsError] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // Seed the form when the dialog opens. Precedence: the freshly-loaded Place
    // Profile → the locally-cached active override (covers a get-site-profile
    // timeout, so the form still reflects what's shown) → the Global Profile.
    useEffect(() => {
        if (!isOpen) return;
        setIsError(false);
        void load().then(profile => {
            const cached = myUid ? useSiteProfilesStore.getState().profiles[myUid] : undefined;
            setNick(profile?.nick || cached?.nick || globalName);
            setThumbnail(profile?.thumbnail || cached?.thumbnail || globalPhoto || undefined);
            setActive(profile?.active ?? !!cached);
        });
    }, [isOpen, load, myUid, globalName, globalPhoto]);

    const handleOpenChange = (next: boolean) => {
        if (next) return;
        close();
    };

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setThumbnail(await resizeImageToBase64(file, THUMBNAIL_SIZE));
        } catch {
            toast({ variant: 'destructive', description: t('profile.place.imageFailed') });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = nick.trim();
        if (!trimmed || isSaving) return;
        setIsError(false);
        try {
            await save({ nick: trimmed, thumbnail, active });
            close();
            toast({ description: t('profile.place.saved') });
        } catch {
            setIsError(true);
        }
    };

    const initial = (nick || globalName).charAt(0).toUpperCase() || '?';

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <div className="flex flex-wrap items-center gap-2">
                    <DialogTitle>{t('profile.place.title')}</DialogTitle>
                    {placeName && <PlaceChip name={placeName} />}
                </div>
                <DialogDescription>{t('profile.place.hint', { place: placeLabel })}</DialogDescription>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-14 w-14 rounded-xl">
                            {thumbnail && <AvatarImage src={thumbnail} alt={nick} />}
                            <AvatarFallback className="rounded-xl text-lg font-semibold" style={avatarStyle(myUid || nick)}>
                                {initial}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                                {t('profile.place.changePhoto')}
                            </Button>
                            {thumbnail && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setThumbnail(undefined)}
                                >
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

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="place-nick">{t('profile.place.nick')}</Label>
                        <Input
                            id="place-nick"
                            autoFocus
                            value={nick}
                            onChange={e => setNick(e.target.value)}
                            placeholder={globalName || t('profile.place.nick')}
                            disabled={busy}
                        />
                    </div>

                    <label className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2">
                        <span className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">{t('profile.place.activeLabel')}</span>
                            <span className="text-caption text-muted-foreground">{t('profile.place.activeHint')}</span>
                        </span>
                        <Switch checked={active} onCheckedChange={setActive} disabled={busy} />
                    </label>

                    {isError && <p className="text-sm text-destructive">{t('profile.place.failed')}</p>}

                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={isSaving}>
                            {t('profile.place.cancel')}
                        </Button>
                        <Button type="submit" disabled={busy || !nick.trim()}>
                            {isSaving ? t('profile.place.saving') : t('profile.place.save')}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
