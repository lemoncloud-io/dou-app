import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Search } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { avatarStyle, displayName, extractErrorMessage } from '../../../shared';
import { useAddMembers, useInviteCandidates, type InviteCandidate } from '../hooks';
import { AvatarRowsSkeleton } from './AvatarRowsSkeleton';

interface AddMembersDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channelId: string;
}

/**
 * Add existing members of my other channels to this one. The server call
 * (`channel.invite` via channelRepository.inviteChannel) adds the picked users
 * immediately — there is no link and no accept step, and no way to reach someone
 * who has no account yet.
 *
 * Mounted only while open (see ChannelActionDialogs): the candidate hook fans out
 * one roster request per channel, which must not run on every panel mount.
 */
export const AddMembersDialog = ({ open, onOpenChange, channelId }: AddMembersDialogProps) => {
    const { t } = useTranslation();
    const { addMembers, isAdding } = useAddMembers(channelId);
    const { candidates, isLoading, error } = useInviteCandidates(channelId);

    // The dialog is mounted only while open, so unmounting is what resets the picked set.
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<string[]>([]);

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
            await addMembers(candidates.filter(c => selected.includes(c.id ?? '')));
            toast({ description: t('channels.addMembers.added', { count: selected.length }) });
            onOpenChange(false);
        } catch (e) {
            toast({ variant: 'destructive', description: extractErrorMessage(e) });
        }
    };

    return (
        <Dialog open={open} onOpenChange={next => !isAdding && onOpenChange(next)}>
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
                            disabled={isAdding}
                        />
                    </div>

                    <div className="scrollbar-thin flex max-h-72 min-h-24 flex-col overflow-y-auto">
                        <CandidateList
                            candidates={filtered}
                            isLoading={isLoading}
                            error={error}
                            hasNoCandidates={candidates.length === 0}
                            selected={selected}
                            onToggle={toggle}
                            disabled={isAdding}
                        />
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
                                disabled={isAdding}
                            >
                                {t('channels.addMembers.cancel')}
                            </Button>
                            <Button type="button" onClick={handleInvite} disabled={isAdding || !selected.length}>
                                {isAdding ? t('channels.addMembers.adding') : t('channels.addMembers.confirm')}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

interface CandidateListProps {
    candidates: InviteCandidate[];
    isLoading: boolean;
    error: Error | null;
    /** True when the pool itself is empty, as opposed to the search filtering it down to nothing. */
    hasNoCandidates: boolean;
    selected: string[];
    onToggle: (userId: string) => void;
    disabled: boolean;
}

/** Body of the picker — early returns per state, matching MemberList. */
const CandidateList = ({
    candidates,
    isLoading,
    error,
    hasNoCandidates,
    selected,
    onToggle,
    disabled,
}: CandidateListProps) => {
    const { t } = useTranslation();

    if (isLoading) {
        return <AvatarRowsSkeleton label={t('channels.addMembers.loading')} />;
    }
    if (error) {
        return <p className="px-2 py-2 text-callout text-destructive">{t('channels.addMembers.loadFailed')}</p>;
    }
    if (candidates.length === 0) {
        return (
            <p className="px-2 py-2 text-callout text-muted-foreground">
                {t(hasNoCandidates ? 'channels.addMembers.empty' : 'channels.addMembers.noMatches')}
            </p>
        );
    }

    return (
        <>
            {candidates.map(candidate => (
                <CandidateRow
                    key={candidate.id}
                    candidate={candidate}
                    isSelected={selected.includes(candidate.id ?? '')}
                    onToggle={() => onToggle(candidate.id ?? '')}
                    disabled={disabled}
                />
            ))}
        </>
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
