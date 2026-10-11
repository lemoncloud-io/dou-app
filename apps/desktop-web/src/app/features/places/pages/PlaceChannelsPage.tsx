import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCheck, ChevronLeft, LogOut, Star, Trash2 } from 'lucide-react';

import { placeScopeKey, usePinnedChannels } from '@chatic/shared';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { runtime } from '@chatic/app-runtime';

import { lastChatNoOf, useChannels, useDesktopChannelMutations, useReadCursorStore } from '../../../shared';
import { ConfirmDialog } from '../../channels/components/ConfirmDialog';
import { isChannelOwner } from '../../channels/utils/isChannelOwner';

interface RemoveTarget {
    id: string;
    name: string;
    action: 'delete' | 'leave';
}

/**
 * Bulk channel manager for one place: multi-select with pin and mark-read,
 * plus per-row delete (owned) or leave behind a confirm. Destructive writes
 * never run unconfirmed; a refused write toasts and the row stays.
 */
export const PlaceChannelsPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { placeId } = useParams<{ placeId: string }>();
    const { channels, isLoading } = useChannels(placeId ?? undefined);
    const myUid = runtime.session.useSessionIdentity().userId;
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const { pinnedIds, toggle: togglePinned } = usePinnedChannels(placeScopeKey(selectedCloudId, placeId));
    const { deleteChannel, leaveChannel } = useDesktopChannelMutations();
    const { join: joinRepository } = runtime.data.useRuntimeRepositories();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [confirmTarget, setConfirmTarget] = useState<RemoveTarget | null>(null);
    const [isRemoving, setIsRemoving] = useState(false);

    const toggleSelected = (id: string) =>
        setSelectedIds(prev => (prev.includes(id) ? prev.filter(candidate => candidate !== id) : [...prev, id]));

    const selectedRows = channels.filter(channel => channel.id && selectedIds.includes(channel.id));

    const pinSelected = () => {
        // Pin the unpinned only: toggling a mixed set would unpin what is pinned.
        for (const channel of selectedRows) {
            if (channel.id && !pinnedIds.includes(channel.id)) togglePinned(channel.id);
        }
    };

    const markSelectedRead = () => {
        for (const channel of selectedRows) {
            const id = channel.id ?? '';
            const chatNo = lastChatNoOf(channel);
            if (!id || chatNo <= 0) continue;
            // Same write as the row menu's mark-as-read: optimistic local
            // cursor first, the server read-chat best-effort behind it.
            useReadCursorStore.getState().markRead(id, chatNo);
            void joinRepository.readChat({ channelId: id, chatNo }).catch(() => undefined);
        }
    };

    const runRemove = async () => {
        if (!confirmTarget || isRemoving) return;
        setIsRemoving(true);
        try {
            if (confirmTarget.action === 'delete') await deleteChannel({ channelId: confirmTarget.id });
            else await leaveChannel({ channelId: confirmTarget.id });
            setSelectedIds(prev => prev.filter(candidate => candidate !== confirmTarget.id));
            setConfirmTarget(null);
        } catch {
            toast({ title: t('place.manage.removeFailed'), variant: 'destructive' });
        } finally {
            setIsRemoving(false);
        }
    };

    return (
        <div className="flex h-full flex-col bg-background">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => navigate(-1)}>
                    <ChevronLeft className="h-4 w-4" />
                    {t('settings.back')}
                </Button>
                <h1 className="text-heading text-foreground">{t('place.manage.title')}</h1>
            </header>

            <div className="scrollbar-thin mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-8">
                {isLoading ? (
                    <div role="status" aria-label={t('chat.loading')} className="mx-auto w-fit py-8">
                        <span className="block h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground motion-reduce:animate-none" />
                    </div>
                ) : (
                    <>
                        {selectedRows.length > 0 && (
                            <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card p-3">
                                <span className="text-callout text-muted-foreground">
                                    {t('place.manage.selected', { count: selectedRows.length })}
                                </span>
                                <span className="ml-auto flex gap-2">
                                    <Button type="button" variant="outline" size="sm" onClick={pinSelected}>
                                        <Star size={14} aria-hidden />
                                        {t('place.manage.pin')}
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" onClick={markSelectedRead}>
                                        <CheckCheck size={14} aria-hidden />
                                        {t('place.manage.markRead')}
                                    </Button>
                                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
                                        {t('place.manage.clear')}
                                    </Button>
                                </span>
                            </div>
                        )}
                        <ul className="flex flex-col gap-1">
                            {channels.map(channel => {
                                const id = channel.id ?? '';
                                const owned = isChannelOwner(channel, myUid);
                                const remove = owned
                                    ? { action: 'delete' as const, label: t('place.manage.deleteChannel') }
                                    : { action: 'leave' as const, label: t('place.manage.leaveChannel') };
                                return (
                                    <li
                                        key={id}
                                        className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(id)}
                                            onChange={() => toggleSelected(id)}
                                            aria-label={t('place.manage.select', { name: channel.name ?? id })}
                                            className="h-4 w-4 shrink-0 accent-primary"
                                        />
                                        <span className="min-w-0 flex-1 truncate text-callout text-foreground">
                                            {channel.name ?? id}
                                        </span>
                                        {(channel.unreadCount ?? 0) > 0 && (
                                            <span className="shrink-0 rounded-full bg-badge-unread px-2 py-0.5 text-overline text-badge-unread-foreground">
                                                {channel.unreadCount}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => togglePinned(id)}
                                            aria-label={t('place.manage.pinOne', { name: channel.name ?? id })}
                                            aria-pressed={pinnedIds.includes(id)}
                                            className="focus-ring tactile shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                        >
                                            <Star
                                                size={16}
                                                aria-hidden
                                                className={
                                                    pinnedIds.includes(id) ? 'fill-favorite text-favorite' : undefined
                                                }
                                            />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setConfirmTarget({
                                                    id,
                                                    name: channel.name ?? id,
                                                    action: remove.action,
                                                })
                                            }
                                            aria-label={remove.label}
                                            className="focus-ring tactile shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                                        >
                                            {owned ? (
                                                <Trash2 size={16} aria-hidden />
                                            ) : (
                                                <LogOut size={16} aria-hidden />
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
            </div>

            <ConfirmDialog
                open={confirmTarget !== null}
                onOpenChange={open => !open && !isRemoving && setConfirmTarget(null)}
                title={t(confirmTarget?.action === 'delete' ? 'place.manage.deleteTitle' : 'place.manage.leaveTitle', {
                    name: confirmTarget?.name ?? '',
                })}
                description={t(
                    confirmTarget?.action === 'delete' ? 'place.manage.deleteBody' : 'place.manage.leaveBody',
                    { name: confirmTarget?.name ?? '' }
                )}
                confirmLabel={t(confirmTarget?.action === 'delete' ? 'place.manage.delete' : 'place.manage.leave')}
                onConfirm={runRemove}
                isPending={isRemoving}
                variant="danger"
            />
        </div>
    );
};
