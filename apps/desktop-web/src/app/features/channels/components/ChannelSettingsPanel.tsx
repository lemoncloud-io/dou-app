import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import type { DomainChannel } from '@chatic/data';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { useSelectedChannelStore } from '../../../shared';
import { useChannelActions, useChannelMembers } from '../hooks';
import { useChannelSettingsStore } from '../stores';
import { isChannelOwner } from '../utils';
import { ChannelActionDialogs } from './ChannelActionDialogs';
import { MemberList } from './MemberList';

interface ChannelSettingsPanelProps {
    /** The channel matching the store's openChannelId, resolved by the host. */
    channel: DomainChannel | undefined;
    myUid: string | null;
}

/**
 * Slack-style right-side settings panel (~320px). Visibility is driven by
 * useChannelSettingsStore.openChannelId; the host renders this only when set.
 * Sections: channel name (+ Rename, owner only), members (+ Invite), footer
 * actions (Leave for everyone, Delete for owner). After delete/leave the panel
 * closes and the selected channel is cleared.
 */
export const ChannelSettingsPanel = ({ channel, myUid }: ChannelSettingsPanelProps) => {
    const { t } = useTranslation();
    const close = useChannelSettingsStore(s => s.close);
    const clearChannel = useSelectedChannelStore(s => s.clearChannel);

    const channelId = channel?.id ?? null;
    const ownerId = channel?.ownerId;
    const isOwner = isChannelOwner(channel, myUid);

    const { members, isLoading, error } = useChannelMembers(channelId, ownerId);
    const memberCount = members.length || channel?.memberNo || 0;

    const actions = useChannelActions(channelId, {
        onRemoved: () => {
            close();
            clearChannel();
        },
    });
    const { openDialog, openKick, kickTarget } = actions;

    if (!channel || !channelId) return null;

    const kickName = members.find(m => m.id === kickTarget)?.name ?? '';

    return (
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-card">
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
                <span className="truncate text-sm font-semibold text-foreground">{t('channels.settings.title')}</span>
                <button
                    type="button"
                    aria-label={t('channels.settings.close')}
                    onClick={close}
                    className="rounded p-1 text-muted-foreground hover:bg-accent"
                >
                    <X size={18} />
                </button>
            </header>

            <div className="flex flex-col gap-6 p-4">
                <section className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                        {t('channels.settings.nameSection')}
                    </h3>
                    <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-foreground">
                            <span className="text-muted-foreground">#</span> {channel.name ?? channelId}
                        </span>
                        {isOwner && (
                            <Button variant="ghost" size="sm" onClick={() => openDialog('rename')}>
                                {t('channels.settings.rename')}
                            </Button>
                        )}
                    </div>
                </section>

                <section className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                        {t('channels.settings.membersSection')} ·{' '}
                        {t('channels.settings.memberCount', { count: memberCount })}
                    </h3>
                    <MemberList
                        members={members}
                        isLoading={isLoading}
                        error={error}
                        myUid={myUid}
                        canKick={isOwner}
                        onKick={openKick}
                    />
                    <Button variant="outline" size="sm" onClick={() => openDialog('invite')}>
                        {t('channels.settings.invite')}
                    </Button>
                </section>

                <section className="flex flex-col gap-2 border-t border-border pt-4">
                    <Button variant="ghost" size="sm" className="justify-start" onClick={() => openDialog('leave')}>
                        {t('channels.settings.leave')}
                    </Button>
                    {isOwner && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="justify-start text-destructive hover:text-destructive"
                            onClick={() => openDialog('delete')}
                        >
                            {t('channels.settings.delete')}
                        </Button>
                    )}
                </section>
            </div>

            <ChannelActionDialogs
                channelId={channelId}
                channelName={channel.name ?? ''}
                kickName={kickName}
                actions={actions}
            />
        </aside>
    );
};
