import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Search } from 'lucide-react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { cn } from '@chatic/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { avatarStyle, displayName, extractErrorMessage, useDesktopChannelMutations } from '../../../shared';
import { useInviteCandidates, type InviteCandidate } from '../hooks';

interface AddMembersDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channelId: string;
}

/**
 * Add existing members of my other channels to this one. The server call
 * (`channel.invite` via channelRepository.inviteChannel) adds the picked users
 * immediately — there is no link and no accept step; that is the phone-relay
 * InviteDialog's separate flow, for people who have no account yet.
 *
 * Mounted only while open (see ChannelActionDialogs): the candidate hook fans out
 * one roster request per channel, which must not run on every panel mount.
 */
export const AddMembersDialog = ({ open, onOpenChange, channelId }: AddMembersDialogProps) => {
    const { t } = useTranslation();
    const { user: userRepository } = useRuntimeRepositories();
    const { inviteChannel, isMutating } = useDesktopChannelMutations();
    const { candidates, isLoading, error } = useInviteCandidates(channelId);

    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<string[]>([]);

    // Drop the picked set + filter whenever the dialog closes, so a reopen starts clean.
    useEffect(() => {
        if (!open) {
            setQuery('');
            setSelected([]);
        }
    }, [open]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return candidates;
        return candidates.filter(c => displayName(c).toLowerCase().includes(q) || (c.id ?? '').includes(q));
    }, [candidates, query]);

    const toggle = (userId: string) =>
        setSelected(prev => (prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]));

    const handleInvite = async () => {
        if (!selected.length) return;
        try {
            await inviteChannel({ channelId, userIds: selected });
            // Direct local write, not a refetch: the picked records are already in hand, and
            // the member list reads the user cache (channelIds), which the channel-side
            // invite response does not touch. cacheWriteMany unions channelIds per user.
            // `$join` is dropped with viaChannels — it is the read-state the candidate
            // carries from the channel we found them in, and it says nothing about this one.
            const picked = candidates.filter(c => selected.includes(c.id ?? ''));
            await userRepository.cacheWriteMany(
                picked.map(candidate => {
                    // A roster read leaves `$join` on the record even though UserView never
                    // declares it — read it off through a narrow cast to drop it.
                    const {
                        viaChannels: _via,
                        $join: _join,
                        ...user
                    } = candidate as InviteCandidate & {
                        $join?: unknown;
                    };
                    return { ...user, channelIds: [channelId] };
                })
            );
            toast({ description: t('channels.addMembers.added', { count: selected.length }) });
            onOpenChange(false);
        } catch (e) {
            toast({ variant: 'destructive', description: extractErrorMessage(e) });
        }
    };

    return (
        <Dialog open={open} onOpenChange={next => !isMutating && onOpenChange(next)}>
            <DialogContent className="sm:max-w-md">
                <DialogTitle>{t('channels.addMembers.title')}</DialogTitle>
                <DialogDescription>{t('channels.addMembers.description')}</DialogDescription>
                <div className="flex flex-col gap-3 pt-2">
                    <div className="relative">
                        <Search
                            size={14}
                            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                        />
                        <Input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder={t('channels.addMembers.searchPlaceholder')}
                            className="focus-ring h-9 border-hairline bg-well pl-8 text-callout shadow-well"
                            disabled={isMutating}
                        />
                    </div>

                    <div className="scrollbar-thin flex max-h-72 min-h-24 flex-col overflow-y-auto">
                        {isLoading ? (
                            <p className="px-2 py-2 text-callout text-muted-foreground">
                                {t('channels.addMembers.loading')}
                            </p>
                        ) : error ? (
                            <p className="px-2 py-2 text-callout text-destructive">
                                {t('channels.addMembers.loadFailed')}
                            </p>
                        ) : filtered.length === 0 ? (
                            <p className="px-2 py-2 text-callout text-muted-foreground">
                                {candidates.length === 0
                                    ? t('channels.addMembers.empty')
                                    : t('channels.addMembers.noMatches')}
                            </p>
                        ) : (
                            filtered.map(candidate => (
                                <CandidateRow
                                    key={candidate.id}
                                    candidate={candidate}
                                    isSelected={selected.includes(candidate.id ?? '')}
                                    onToggle={() => toggle(candidate.id ?? '')}
                                    disabled={isMutating}
                                />
                            ))
                        )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                        <span className="text-caption text-muted-foreground">
                            {selected.length > 0 && t('channels.addMembers.selected', { count: selected.length })}
                        </span>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => onOpenChange(false)}
                                disabled={isMutating}
                            >
                                {t('channels.addMembers.cancel')}
                            </Button>
                            <Button type="button" onClick={handleInvite} disabled={isMutating || !selected.length}>
                                {isMutating ? t('channels.addMembers.adding') : t('channels.addMembers.confirm')}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

interface CandidateRowProps {
    candidate: InviteCandidate;
    isSelected: boolean;
    onToggle: () => void;
    disabled: boolean;
}

const CandidateRow = ({ candidate, isSelected, onToggle, disabled }: CandidateRowProps) => {
    const name = displayName(candidate);
    const initial = name.charAt(0).toUpperCase() || '?';

    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            onClick={onToggle}
            disabled={disabled}
            className={cn(
                'focus-ring flex min-h-11 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent',
                isSelected && 'bg-accent'
            )}
        >
            <Avatar className="size-8 shrink-0">
                {candidate.thumbnail && <AvatarImage src={candidate.thumbnail} alt={name} />}
                <AvatarFallback className="text-xs font-semibold" style={avatarStyle(candidate.id || name)}>
                    {initial}
                </AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-callout text-foreground">{name}</span>
                <span className="truncate text-caption text-muted-foreground">{candidate.viaChannels.join(', ')}</span>
            </span>
            <span
                className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded border border-hairline',
                    isSelected && 'border-primary bg-primary text-primary-foreground'
                )}
            >
                {isSelected && <Check size={14} />}
            </span>
        </button>
    );
};
