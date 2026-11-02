import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Popover, PopoverAnchor, PopoverContent } from '@chatic/ui-kit/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@chatic/ui-kit/components/ui/tabs';

import { avatarStyle } from '../../../shared';

/** A member as the read list shows them. */
export interface ReadPerson {
    id: string;
    name: string;
    thumbnail?: string;
}

interface ReadReceiptPillProps {
    readers: ReadPerson[];
    nonReaders: ReadPerson[];
}

/** Faces drawn in the pill before the rest collapse into "+N". */
const STACK_SIZE = 3;
/** Grace for the pointer to cross the gap between the pill and the popover without it closing. */
const CLOSE_DELAY_MS = 150;

const Face = ({ person, className }: { person: ReadPerson; className: string }) => (
    <Avatar className={className}>
        {person.thumbnail && <AvatarImage src={person.thumbnail} alt="" />}
        <AvatarFallback className="font-semibold" style={avatarStyle(person.id)}>
            {person.name.charAt(0).toUpperCase() || '?'}
        </AvatarFallback>
    </Avatar>
);

const PersonList = ({ people, empty }: { people: ReadPerson[]; empty: string }) =>
    people.length === 0 ? (
        <p className="px-4 py-6 text-center text-caption text-muted-foreground">{empty}</p>
    ) : (
        <ul className="max-h-72 overflow-y-auto py-1">
            {people.map(person => (
                <li key={person.id} className="flex items-center gap-3 px-4 py-2">
                    <Face person={person} className="h-8 w-8 shrink-0 text-caption" />
                    <span className="truncate text-sm font-semibold">{person.name}</span>
                </li>
            ))}
        </ul>
    );

/**
 * The read count under an author block, with the faces of the first few who read it. Resting the
 * pointer on it opens a card listing who has read the message and who has not, a tab each. It opens
 * on hover rather than on click because it is a glance, not a destination, and the short close delay
 * lets the pointer travel onto the card to scroll a long list.
 *
 * A hover leaves focus where it was. Opened from the keyboard (Enter or Space on the pill) the card
 * takes focus instead, so the tabs and lists are reachable — the card is portaled, so Tab from the
 * pill would otherwise walk on through the feed. Escape or focus leaving the card closes it, and
 * Escape hands focus back to the pill.
 */
export const ReadReceiptPill = ({ readers, nonReaders }: ReadReceiptPillProps) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    // How the card was opened: only a keyboard open moves focus into it, and only a pointer open
    // closes when the pointer leaves.
    const openedBy = useRef<'pointer' | 'keyboard'>('pointer');
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pillRef = useRef<HTMLButtonElement>(null);
    // Set by Escape only: a close from clicking or tabbing elsewhere leaves focus where the reader put it.
    const closedByEscape = useRef(false);

    const cancelClose = () => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        closeTimer.current = null;
    };
    const show = (by: 'pointer' | 'keyboard') => {
        cancelClose();
        openedBy.current = by;
        setOpen(true);
    };
    const hideSoon = () => {
        cancelClose();
        if (openedBy.current === 'keyboard') return;
        closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
    };
    useEffect(() => cancelClose, []);

    const read = readers.length;
    const unread = nonReaders.length;
    const stacked = readers.slice(0, STACK_SIZE);
    const more = read - stacked.length;

    return (
        <Popover
            open={open}
            onOpenChange={next => {
                cancelClose();
                setOpen(next);
            }}
        >
            <PopoverAnchor asChild>
                <button
                    ref={pillRef}
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    onPointerEnter={() => show('pointer')}
                    onPointerLeave={hideSoon}
                    // A click from Enter or Space carries no pointer detail.
                    onClick={event => show(event.detail === 0 ? 'keyboard' : 'pointer')}
                    className="focus-ring mt-1 flex w-fit items-center gap-1.5 rounded-full bg-muted py-1 pl-1 pr-2 text-caption font-medium tabular-nums text-muted-foreground"
                >
                    {stacked.length > 0 && (
                        <span aria-hidden className="flex items-center -space-x-1.5">
                            {stacked.map(person => (
                                <Face key={person.id} person={person} className="h-5 w-5 text-nano ring-2 ring-muted" />
                            ))}
                            {more > 0 && (
                                <span className="relative flex h-5 min-w-5 items-center justify-center rounded-full bg-background px-1 text-nano font-semibold ring-2 ring-muted">
                                    +{more}
                                </span>
                            )}
                        </span>
                    )}
                    <span className={stacked.length > 0 ? undefined : 'pl-1'}>
                        {unread > 0
                            ? t('chat.readCount.summary', { read, unread })
                            : t('chat.readCount.allSeen', { read })}
                    </span>
                </button>
            </PopoverAnchor>
            <PopoverContent
                align="start"
                side="top"
                className="w-64 overflow-hidden p-0"
                aria-label={t('chat.readCount.listLabel')}
                // A hover must not pull focus off whatever the reader was doing.
                onOpenAutoFocus={event => {
                    if (openedBy.current === 'pointer') event.preventDefault();
                }}
                // Radix hands focus back only to a PopoverTrigger, and the pill is an anchor (a trigger
                // would toggle the card shut on the click that follows a hover). So Escape on a
                // keyboard-opened card returns focus to the pill here; any other close leaves it alone.
                onEscapeKeyDown={() => {
                    closedByEscape.current = true;
                }}
                onCloseAutoFocus={event => {
                    event.preventDefault();
                    if (closedByEscape.current && openedBy.current === 'keyboard') pillRef.current?.focus();
                    closedByEscape.current = false;
                }}
                onPointerEnter={cancelClose}
                onPointerLeave={hideSoon}
            >
                <Tabs defaultValue="read">
                    <TabsList className="flex h-auto w-full justify-start gap-4 rounded-none border-b border-hairline bg-transparent px-4 py-0">
                        <TabsTrigger
                            value="read"
                            className="-mb-px rounded-none border-b-2 border-transparent px-0 py-2.5 data-[state=active]:border-foreground data-[state=active]:shadow-none"
                        >
                            {t('chat.readCount.tabSeen', { count: read })}
                        </TabsTrigger>
                        <TabsTrigger
                            value="unread"
                            className="-mb-px rounded-none border-b-2 border-transparent px-0 py-2.5 data-[state=active]:border-foreground data-[state=active]:shadow-none"
                        >
                            {t('chat.readCount.tabNotSeen', { count: unread })}
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="read" className="mt-0">
                        <PersonList people={readers} empty={t('chat.readCount.noneSeen')} />
                    </TabsContent>
                    <TabsContent value="unread" className="mt-0">
                        <PersonList people={nonReaders} empty={t('chat.readCount.everyoneSeen')} />
                    </TabsContent>
                </Tabs>
            </PopoverContent>
        </Popover>
    );
};
