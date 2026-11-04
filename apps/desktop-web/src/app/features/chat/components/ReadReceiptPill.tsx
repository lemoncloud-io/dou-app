import { useTranslation } from 'react-i18next';

import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@chatic/ui-kit/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@chatic/ui-kit/components/ui/tabs';

import { avatarStyle } from '../../../shared';

/** A member as the read list shows them. */
export interface ReadPerson {
    id: string;
    name: string;
    thumbnail?: string;
}

export interface ReadMarker {
    /** The members whose last read message is the one this sits on — the faces drawn. */
    faces: ReadPerson[];
    /** Everyone who has read that message, for the list the faces open. */
    readers: ReadPerson[];
    /** Everyone it was meant for who has not, for the same list. */
    nonReaders: ReadPerson[];
}

/** Faces drawn before the rest collapse into "+N". */
const STACK_SIZE = 3;
const TAB_TRIGGER =
    '-mb-px rounded-none border-b-2 border-transparent px-0 py-2.5 data-[state=active]:border-foreground data-[state=active]:shadow-none';

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
 * The faces of the members who stopped reading at this message, at the right end of its row.
 * Clicking them opens a card listing who has read the message and who has not, a tab each. It opens
 * on click rather than on hover so the card stays put while the pointer travels to the Not seen tab.
 * The counts are not drawn: the faces are the whole of the row, and the button's name carries the
 * counts for a screen reader.
 */
export const ReadReceiptPill = ({ faces, readers, nonReaders }: ReadMarker) => {
    const { t } = useTranslation();

    const read = readers.length;
    const unread = nonReaders.length;
    const stacked = faces.slice(0, STACK_SIZE);
    const more = faces.length - stacked.length;

    return (
        <div className="mt-1 flex justify-end">
            <Popover>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        aria-label={
                            unread > 0
                                ? t('chat.readCount.summary', { read, unread })
                                : t('chat.readCount.allSeen', { read })
                        }
                        className="focus-ring flex w-fit items-center rounded-full bg-muted p-1 tabular-nums text-muted-foreground"
                    >
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
                    </button>
                </PopoverTrigger>
                <PopoverContent
                    align="end"
                    side="top"
                    className="w-64 overflow-hidden p-0"
                    aria-label={t('chat.readCount.listLabel')}
                >
                    <Tabs defaultValue="read">
                        <TabsList className="flex h-auto w-full justify-start gap-4 rounded-none border-b border-hairline bg-transparent px-4 py-0">
                            <TabsTrigger value="read" className={TAB_TRIGGER}>
                                {t('chat.readCount.tabSeen', { count: read })}
                            </TabsTrigger>
                            <TabsTrigger value="unread" className={TAB_TRIGGER}>
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
        </div>
    );
};
