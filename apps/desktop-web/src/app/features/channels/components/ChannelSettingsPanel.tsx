import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Search, X } from 'lucide-react';

import type { DomainChannel } from '@chatic/data';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Input } from '@chatic/ui-kit/components/ui/input';

import { displayName, useSelectedChannelStore } from '../../../shared';
import { useChannelActions, useChannelMembers } from '../hooks';
import { useChannelSettingsStore } from '../stores';
import { isChannelOwner } from '../utils';
import { ChannelActionDialogs } from './ChannelActionDialogs';
import { MemberList } from './MemberList';

/** Below this member count the roster is short enough to scan without a filter. */
const MEMBER_SEARCH_THRESHOLD = 5;

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

    // Filter only kicks in on larger rosters — a handful of members needs no search box.
    const [memberQuery, setMemberQuery] = useState('');
    const showMemberSearch = members.length > MEMBER_SEARCH_THRESHOLD;
    const filteredMembers = useMemo(() => {
        const q = memberQuery.trim().toLowerCase();
        if (!q) return members;
        return members.filter(m => displayName(m).toLowerCase().includes(q));
    }, [members, memberQuery]);
    const noMatches = memberQuery.trim().length > 0 && filteredMembers.length === 0;

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
        <aside className="scrollbar-thin flex w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-card">
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
                <span className="truncate text-sm font-semibold text-foreground">{t('channels.settings.title')}</span>
                <button
                    type="button"
                    aria-label={t('channels.settings.close')}
                    onClick={close}
                    className="rounded p-1 text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">
                                #
                            </span>
                            <span className="truncate">{channel.name ?? channelId}</span>
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
                    {showMemberSearch && (
                        <div className="relative">
                            <Search
                                size={14}
                                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                            />
                            <Input
                                value={memberQuery}
                                onChange={e => setMemberQuery(e.target.value)}
                                placeholder={t('channels.members.search')}
                                className="h-8 bg-background pl-8 text-sm"
                            />
                        </div>
                    )}
                    {noMatches ? (
                        <p className="px-2 py-2 text-sm text-muted-foreground">{t('channels.members.noMatches')}</p>
                    ) : (
                        <MemberList
                            members={filteredMembers}
                            isLoading={isLoading}
                            error={error}
                            myUid={myUid}
                            canKick={isOwner}
                            onKick={openKick}
                        />
                    )}
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
