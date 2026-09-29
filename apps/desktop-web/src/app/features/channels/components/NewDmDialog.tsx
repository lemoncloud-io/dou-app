import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Search } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';

import {
    avatarStyle,
    displayName,
    resolveDisplay,
    useSiteProfileMap,
    useStartDm,
    type ResolvedDisplay,
} from '../../../shared';
import { useInviteCandidates, type InviteCandidate } from '../hooks';
import { AvatarRowsSkeleton } from './AvatarRowsSkeleton';

interface NewDmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Start a 1:1 with someone from this cloud. One pick opens the room: the server returns the
 * existing 1:1 for a pair that already has one, so people I already talk to stay in the list and
 * picking them just takes me back there.
 *
 * The pool is the people I share a channel with — the server has no user directory to search.
 * On failure the dialog stays open (the hook shows the toast) so the pick can be retried.
 *
 * Mount it only while open: the candidate hook fans out one roster request per channel.
 */
export const NewDmDialog = ({ open, onOpenChange }: NewDmDialogProps) => {
    const { t } = useTranslation();
    const { startDm, isStarting } = useStartDm();
    const { candidates, isLoading, error } = useInviteCandidates(null, { enabled: true });
    const [query, setQuery] = useState('');
    const placeProfiles = useSiteProfileMap();

    // Each person as the sidebar's 1:1 rows show them: this place's profile (nick and photo) over
    // the user record. The search matches that name, the account name and the id.
    const peers = useMemo(
        () =>
            candidates.map(candidate => ({
                candidate,
                display: resolveDisplay(placeProfiles[candidate.id ?? ''], displayName(candidate), candidate.thumbnail),
            })),
        [candidates, placeProfiles]
    );
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return peers;
        return peers.filter(
            ({ candidate, display }) =>
                display.name.toLowerCase().includes(q) ||
                displayName(candidate).toLowerCase().includes(q) ||
                (candidate.id ?? '').toLowerCase().includes(q)
        );
    }, [peers, query]);

    const handlePick = async (userId: string) => {
        const room = await startDm(userId);
        if (room) onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={next => !isStarting && onOpenChange(next)}>
            <DialogContent closeLabel={t('common.close')} className="sm:max-w-md">
                <DialogTitle>{t('dm.new.title')}</DialogTitle>
                <DialogDescription>{t('dm.new.description')}</DialogDescription>
                <div className="flex flex-col gap-3 pt-2">
                    <div className="relative">
                        <Search
                            size={14}
                            aria-hidden
                            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                        />
                        <Input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder={t('dm.new.searchPlaceholder')}
                            aria-label={t('dm.new.searchPlaceholder')}
                            className="focus-ring h-9 border-hairline bg-well pl-8 text-callout shadow-well"
                            disabled={isStarting}
                        />
                    </div>

                    <div className="scrollbar-thin flex max-h-72 min-h-24 flex-col overflow-y-auto">
                        <PeerList
                            peers={filtered}
                            isLoading={isLoading}
                            error={error}
                            hasNoCandidates={candidates.length === 0}
                            onPick={handlePick}
                            disabled={isStarting}
                        />
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

interface Peer {
    candidate: InviteCandidate;
    display: ResolvedDisplay;
}

interface PeerListProps {
    peers: Peer[];
    isLoading: boolean;
    error: Error | null;
    /** True when the pool itself is empty, as opposed to the search filtering it down to nothing. */
    hasNoCandidates: boolean;
    onPick: (userId: string) => void;
    disabled: boolean;
}

/** Body of the picker — early returns per state, matching the add-members picker. */
const PeerList = ({ peers, isLoading, error, hasNoCandidates, onPick, disabled }: PeerListProps) => {
    const { t } = useTranslation();

    if (isLoading) {
        return <AvatarRowsSkeleton label={t('dm.new.loading')} />;
    }
    if (error) {
        return <p className="px-2 py-2 text-callout text-destructive">{t('dm.new.loadFailed')}</p>;
    }
    if (peers.length === 0) {
        return (
            <p className="px-2 py-2 text-callout text-muted-foreground">
                {t(hasNoCandidates ? 'dm.new.empty' : 'dm.new.noMatches')}
            </p>
        );
    }

    return (
        <>
            {peers.map(({ candidate, display }) => (
                <PeerRow
                    key={candidate.id}
                    candidate={candidate}
                    display={display}
                    onPick={() => onPick(candidate.id ?? '')}
                    disabled={disabled}
                />
            ))}
        </>
    );
};

interface PeerRowProps {
    candidate: InviteCandidate;
    display: ResolvedDisplay;
    onPick: () => void;
    disabled: boolean;
}

const PeerRow = ({ candidate, display, onPick, disabled }: PeerRowProps) => {
    const { name, thumbnail } = display;
    const initial = name.charAt(0).toUpperCase() || '?';
    const via = candidate.viaChannels.join(', ');

    return (
        <button
            type="button"
            onClick={onPick}
            disabled={disabled}
            className="focus-ring flex min-h-11 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent disabled:opacity-60"
        >
            <Avatar className="size-8 shrink-0">
                {thumbnail && <AvatarImage src={thumbnail} alt={name} />}
                <AvatarFallback className="text-xs font-semibold" style={avatarStyle(candidate.id || name)}>
                    {initial}
                </AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-callout text-foreground">{name}</span>
                {via && <span className="truncate text-caption text-muted-foreground">{via}</span>}
            </span>
        </button>
    );
};
