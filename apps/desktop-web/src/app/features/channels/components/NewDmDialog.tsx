import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Search } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { runtime } from '@chatic/app-runtime';

import {
    avatarStyle,
    displayName,
    resolveDisplay,
    useSiteProfileMap,
    useStartDm,
    useUser,
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
 * I am offered too, pinned first, for my notes-to-self room. The pool leaves me out (it is people
 * to talk to) and the room comes from its own call, so the row is drawn separately — independent of
 * the pool loading, failing or being empty.
 *
 * The pool is the people I share a channel with — the server has no user directory to search.
 * On failure the dialog stays open (the hook shows the toast) so the pick can be retried.
 *
 * Mount it only while open: the candidate hook fans out one roster request per channel.
 */
export const NewDmDialog = ({ open, onOpenChange }: NewDmDialogProps) => {
    const { t } = useTranslation();
    const { startDm, openSelf, isStarting, canOpenSelf } = useStartDm();
    const { candidates, isLoading, error } = useInviteCandidates(null, { enabled: true });
    const [query, setQuery] = useState('');
    const placeProfiles = useSiteProfileMap();
    // My id in this cloud, which is what place profiles are keyed by — the session one can differ.
    const myUid = runtime.session.useUidInCloud(runtime.session.useGlobalSession().cloud.cloudId ?? '') ?? '';
    const me = useUser(myUid || null);
    const myDisplay = resolveDisplay(placeProfiles[myUid], me ? displayName(me) : t('dm.you'), me?.thumbnail);

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
    const q = query.trim().toLowerCase();
    const filtered = useMemo(() => {
        if (!q) return peers;
        return peers.filter(
            ({ candidate, display }) =>
                display.name.toLowerCase().includes(q) ||
                displayName(candidate).toLowerCase().includes(q) ||
                (candidate.id ?? '').toLowerCase().includes(q)
        );
    }, [peers, q]);
    const showSelf =
        canOpenSelf &&
        (!q ||
            [myDisplay.name, me ? displayName(me) : '', myUid, t('dm.you'), t('dm.new.self')].some(text =>
                text.toLowerCase().includes(q)
            ));

    const handlePick = async (userId: string) => {
        const room = await startDm(userId);
        if (room) onOpenChange(false);
    };
    const handlePickSelf = async () => {
        if (await openSelf()) onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={next => !isStarting && onOpenChange(next)}>
            {/* A flex column, as in AddMembersDialog: in a short window the list gives way first. */}
            <DialogContent closeLabel={t('common.close')} className="flex flex-col sm:max-w-md">
                <DialogTitle>{t('dm.new.title')}</DialogTitle>
                <DialogDescription>{t('dm.new.description')}</DialogDescription>
                <div className="flex min-h-0 flex-col gap-3 pt-2">
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
                        {showSelf && (
                            <PeerRow
                                seed={myUid || myDisplay.name}
                                display={myDisplay}
                                // Before my record loads the name already reads "You"; don't say it twice.
                                tag={me ? t('dm.you') : undefined}
                                detail={t('dm.new.self')}
                                onPick={handlePickSelf}
                                disabled={isStarting}
                            />
                        )}
                        <PeerList
                            peers={filtered}
                            isLoading={isLoading}
                            error={error}
                            hasNoCandidates={candidates.length === 0}
                            hasSelfMatch={showSelf}
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
    /** The pinned "me" row is showing, so a search that matches only me is not "no matches". */
    hasSelfMatch: boolean;
    onPick: (userId: string) => void;
    disabled: boolean;
}

/** Body of the picker — early returns per state, matching the add-members picker. */
const PeerList = ({ peers, isLoading, error, hasNoCandidates, hasSelfMatch, onPick, disabled }: PeerListProps) => {
    const { t } = useTranslation();

    if (isLoading) {
        return <AvatarRowsSkeleton label={t('dm.new.loading')} />;
    }
    if (error) {
        return <p className="px-2 py-2 text-callout text-destructive">{t('dm.new.loadFailed')}</p>;
    }
    if (peers.length === 0) {
        if (!hasNoCandidates && hasSelfMatch) return null;
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
                    seed={candidate.id || display.name}
                    display={display}
                    detail={candidate.viaChannels.join(', ')}
                    onPick={() => onPick(candidate.id ?? '')}
                    disabled={disabled}
                />
            ))}
        </>
    );
};

interface PeerRowProps {
    /** Avatar colour seed — the person's id. */
    seed: string;
    display: ResolvedDisplay;
    /** Small label beside the name ("You" on my own row). */
    tag?: string;
    /** Second line: the channels we share, or what my own row opens. */
    detail?: string;
    onPick: () => void;
    disabled: boolean;
}

const PeerRow = ({ seed, display, tag, detail, onPick, disabled }: PeerRowProps) => {
    const { name, thumbnail } = display;
    const initial = name.charAt(0).toUpperCase() || '?';

    return (
        <button
            type="button"
            onClick={onPick}
            disabled={disabled}
            className="focus-ring flex min-h-11 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent disabled:opacity-60"
        >
            <Avatar className="size-8 shrink-0">
                {thumbnail && <AvatarImage src={thumbnail} alt={name} />}
                <AvatarFallback className="text-micro font-semibold" style={avatarStyle(seed)}>
                    {initial}
                </AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-callout text-foreground">{name}</span>
                    {tag && <span className="shrink-0 text-caption text-muted-foreground">{tag}</span>}
                </span>
                {detail && <span className="truncate text-caption text-muted-foreground">{detail}</span>}
            </span>
        </button>
    );
};
