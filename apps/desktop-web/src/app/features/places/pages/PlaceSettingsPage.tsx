import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, MapPin } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';

import { formatLongDate, useAuthorNames, usePlaces } from '../../../shared';
import { runtime } from '@chatic/app-runtime';
import { useEditPlaceDialogStore } from '../../chat/stores/useEditPlaceDialogStore';
import { useEditPlaceProfileDialogStore } from '../../profile/stores/useEditPlaceProfileDialogStore';

/**
 * One place's settings surface: read-only info plus the entries that act on
 * it. The "my profile" entry shows only for the ACTIVE place — the edit
 * dialog it opens has no place parameter and always edits the active one, so
 * offering it elsewhere would edit the wrong place.
 */
export const PlaceSettingsPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { placeId } = useParams<{ placeId: string }>();
    const { places, isLoading } = usePlaces();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const openMyProfile = useEditPlaceProfileDialogStore(s => s.open);
    const openEditPlace = useEditPlaceDialogStore(s => s.open);

    const place = places.find(row => row.id === placeId);
    const ownerNames = useAuthorNames(place?.ownerId ? [place.ownerId] : []);
    const ownerName = place?.ownerId ? ownerNames.get(place.ownerId) : undefined;

    if (isLoading) {
        return (
            <div className="flex h-full flex-col bg-background">
                <div role="status" aria-label={t('chat.loading')} className="m-auto">
                    <span className="block h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground motion-reduce:animate-none" />
                </div>
            </div>
        );
    }

    if (!place) {
        return (
            <div className="flex h-full flex-col bg-background">
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                    <p className="text-callout text-foreground">{t('place.settings.notFound')}</p>
                    <Button variant="outline" size="sm" onClick={() => navigate('/')}>
                        {t('settings.back')}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col bg-background">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => navigate('/')}>
                    <ChevronLeft className="h-4 w-4" />
                    {t('settings.back')}
                </Button>
                <h1 className="text-heading text-foreground">{t('place.settings.title')}</h1>
            </header>

            <div className="scrollbar-thin mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-8">
                <section className="flex flex-col gap-4">
                    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
                        <Avatar className="h-14 w-14">
                            <AvatarImage src={place.thumbnail || undefined} alt="" />
                            <AvatarFallback>
                                <MapPin size={22} aria-hidden />
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex min-w-0 flex-col gap-0.5">
                            <h2 className="truncate text-heading text-foreground">{place.name ?? place.id}</h2>
                            {place.desc ? (
                                <p className="text-callout text-muted-foreground">{place.desc}</p>
                            ) : (
                                <p className="text-caption text-muted-foreground">
                                    {t('place.settings.noDescription')}
                                </p>
                            )}
                        </div>
                    </div>

                    {(place.createdAt || ownerName) && (
                        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
                            {place.createdAt ? (
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-callout text-muted-foreground">
                                        {t('place.settings.created')}
                                    </span>
                                    <span className="text-callout text-foreground">
                                        {formatLongDate(place.createdAt)}
                                    </span>
                                </div>
                            ) : null}
                            {ownerName ? (
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-callout text-muted-foreground">
                                        {t('place.settings.owner')}
                                    </span>
                                    <span className="text-callout text-foreground">{ownerName}</span>
                                </div>
                            ) : null}
                        </div>
                    )}

                    {place.id === selectedSiteId && (
                        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="text-callout font-medium text-foreground">
                                    {t('place.settings.myProfile')}
                                </span>
                                <span className="text-caption text-muted-foreground">
                                    {t('place.settings.myProfileHint')}
                                </span>
                            </div>
                            <Button variant="outline" size="sm" onClick={openMyProfile}>
                                {t('place.settings.edit')}
                            </Button>
                        </div>
                    )}

                    {/* Owners alone rename the place itself; everyone else reads it above. */}
                    {place.isOwner && (
                        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="text-callout font-medium text-foreground">
                                    {t('place.settings.editPlace')}
                                </span>
                                <span className="text-caption text-muted-foreground">
                                    {t('place.settings.editPlaceHint')}
                                </span>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                aria-label={t('place.settings.editPlace')}
                                onClick={() => place.id && openEditPlace(place.id)}
                            >
                                {t('place.settings.edit')}
                            </Button>
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
                        <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-callout font-medium text-foreground">{t('place.manage.open')}</span>
                            <span className="text-caption text-muted-foreground">{t('place.manage.openHint')}</span>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            aria-label={t('place.manage.open')}
                            onClick={() => navigate(`/places/${place.id}/channels`)}
                        >
                            {t('place.settings.edit')}
                        </Button>
                    </div>
                </section>
            </div>
        </div>
    );
};
