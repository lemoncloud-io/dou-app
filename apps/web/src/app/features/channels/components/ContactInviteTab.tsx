import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ContactInfo } from '@chatic/app-messages';
import { isNative, logger } from '@chatic/bridges';
import {
    Button,
    FloatingButton,
    IconLink,
    SearchInput,
    SelectableUserItem,
    SelectedAvatarRow,
} from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { appBridge } from '../../../bridge';
import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
import type { InviteMessageChannel } from '../../invite/utils/sendInviteMessage';
import { PermissionDeniedBanner } from './PermissionDeniedBanner';
import {
    compareContactLabels,
    contactSearchText,
    resolveContactDisplayPhone,
    resolveContactName,
    resolveContactPhone,
    resolveContactSubtitle,
} from '../utils/deviceContact';

interface ContactInviteTabProps {
    /**
     * Whether the tab is on screen. The tab stays mounted while hidden, so its contacts and selection
     * survive a trip to another tab; this only decides whether it renders and whether contacts have
     * been asked for yet.
     */
    active: boolean;
    maxSelection: number;
    /** Invite one person — a text to that number (app) or the clipboard (web). */
    sendSingle: (recipient: { name: string; phone: string }) => Promise<InviteMessageChannel | false>;
    /** Invite several at once — the server fans the batch out over SMS itself. */
    sendBatch: (phones: string[]) => Promise<unknown>;
    /** Called once an invite went out, so the host can leave the flow. */
    onSent: () => void;
    /** Opens the host's name-and-number link sheet — the web's only path, and native's way past the list. */
    onRequestLink: () => void;
    /** The web guide's body; defaults to the room invite's, which speaks of inviting to a conversation. */
    webGuideDescription?: string;
}

/**
 * Invite by device contact: the picker, its permission states, and the send. Shared by the group
 * room's invite page and the place invite, which differ only in what an invite is FOR — so what to
 * send is the host's (`sendSingle` / `sendBatch`), and everything a person sees here is the same.
 *
 * Native: multi-select device contacts. Web: no contacts access → funneled into the link sheet.
 */
export const ContactInviteTab = ({
    active,
    maxSelection,
    sendSingle,
    sendBatch,
    onSent,
    onRequestLink,
    webGuideDescription,
}: ContactInviteTabProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();

    const isOnMobileApp = isNative();
    const [search, setSearch] = useState('');
    const [contacts, setContacts] = useState<ContactInfo[]>([]);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [isWaitingForContacts, setIsWaitingForContacts] = useState(isOnMobileApp);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBatchInviting, setIsBatchInviting] = useState(false);

    // Bound here because the chain's last resort is a translated label: a contact with no name, no
    // company and no number would otherwise render as an empty row (see resolveContactName).
    const nameOf = useCallback(
        (contact: ContactInfo) => resolveContactName(contact, t('inviteFriends.unnamedContact')),
        [t]
    );

    /**
     * Loads contacts only on native. Web has no contacts access → funneled into the invite link.
     *
     * Only called once the tab is actually shown. `getContacts()` raises the OS permission popup,
     * and a host that opens on another tab would otherwise **prompt for permission even from a user
     * with no intention of using contacts.**
     *
     * The trigger is **has it ever been shown** (`contactsRequested`), not `active` directly.
     * Depending directly on `active` would run cleanup when the tab is flipped away, which cancels
     * the in-flight request — and if the response arrives in that window, no state ever gets set
     * and only the re-request guard remains, leaving the contacts tab permanently blank. This flag
     * only ever flips false→true once, so the effect runs once too, and cleanup only runs on unmount.
     */
    const [contactsRequested, setContactsRequested] = useState(false);
    useEffect(() => {
        if (active) setContactsRequested(true);
    }, [active]);

    useEffect(() => {
        if (!isOnMobileApp || !contactsRequested) return;
        let cancelled = false;
        setIsWaitingForContacts(true);
        appBridge
            .getContacts()
            .then(response => {
                if (cancelled) return;
                const received = response.data?.contacts ?? [];
                const permission = response.data?.permission;
                setIsWaitingForContacts(false);
                setContacts(received);
                // A shell that states the permission is believed, so an empty address book is an
                // empty list rather than a denial. One built before the field existed says nothing,
                // and then an empty list is the only sign of a denial left to go on.
                setPermissionDenied(permission ? permission === 'denied' : received.length === 0);
            })
            .catch(() => {
                if (cancelled) return;
                setIsWaitingForContacts(false);
                // Also a denial, not only a failure: an iOS app built before `permission` existed
                // answers a refusal with an error, so reading this as anything else would drop those
                // users onto a blank tab. It also catches a timeout, which lands on the same banner.
                setPermissionDenied(true);
            });
        return () => {
            cancelled = true;
        };
    }, [isOnMobileApp, contactsRequested]);

    /**
     * A contact with no stored number at all is kept out of the list.
     *
     * Since an invite goes out by number, such a row can't be invited and can't even be
     * identified by a number instead of a name — better to leave it out entirely than to leave a
     * row in the list that can't be tapped. The check uses **the same function** that builds the
     * label (`resolveContactDisplayPhone`), so "no number to show" and "excluded from the list"
     * never disagree.
     *
     * A number that isn't a valid Korean mobile (landline, overseas) is **not** filtered out
     * here. That row is still identified by its number — only the invite is disabled. "It's
     * stored but not shown" and "it can't be invited" are different stories.
     */
    const listedContacts = useMemo(
        () =>
            contacts
                .filter(c => resolveContactDisplayPhone(c) !== '')
                // Sorted here because neither platform sorts: iOS fetches with no sort order and
                // Android reads rows in storage order, so the same address book arrived in two
                // different orders. The key is the label the row shows, not a raw field.
                .map(contact => ({ contact, label: nameOf(contact) }))
                .sort((a, b) => compareContactLabels(a.label, b.label))
                .map(({ contact }) => contact),
        [contacts, nameOf]
    );

    const query = search.trim().toLowerCase();

    const matchedContacts = useMemo(
        () => (query ? listedContacts.filter(c => contactSearchText(c).includes(query)) : listedContacts),
        [listedContacts, query]
    );

    // Selected contacts stay at the top regardless of the filter; the rest get the search filter applied.
    const filteredContacts = useMemo(
        () => [
            ...listedContacts.filter(c => selectedIds.has(c.recordID)),
            ...matchedContacts.filter(c => !selectedIds.has(c.recordID)),
        ],
        [listedContacts, matchedContacts, selectedIds]
    );

    // The count above the list is the matches alone — a selected row stays pinned on top even when it
    // does not match, and counting it would claim a result the search did not find.
    const listedCount = matchedContacts.length;

    const selectedItems = useMemo(
        () => listedContacts.filter(c => selectedIds.has(c.recordID)).map(c => ({ id: c.recordID, name: nameOf(c) })),
        [listedContacts, selectedIds, nameOf]
    );

    const handleToggle = useCallback(
        (contact: ContactInfo, next: boolean) => {
            if (isBatchInviting) return;
            setSelectedIds(prev => {
                if (next && prev.size >= maxSelection && !prev.has(contact.recordID)) {
                    toast({ title: t('inviteFriends.limitToast', { max: maxSelection }) });
                    return prev;
                }
                const updated = new Set(prev);
                if (next) {
                    updated.add(contact.recordID);
                } else {
                    updated.delete(contact.recordID);
                }
                return updated;
            });
        },
        [isBatchInviting, maxSelection, toast, t]
    );

    const removeSelected = useCallback((id: string) => {
        setSelectedIds(prev => {
            const updated = new Set(prev);
            updated.delete(id);
            return updated;
        });
    }, []);

    const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

    const handleBatchInvite = async () => {
        if (selectedIds.size === 0 || isBatchInviting) return;

        const recipients: { name: string; phone: string }[] = [];
        for (const contact of listedContacts) {
            if (!selectedIds.has(contact.recordID)) continue;
            const phone = resolveContactPhone(contact);
            if (phone) recipients.push({ name: nameOf(contact), phone });
        }
        if (recipients.length === 0) return;

        setIsBatchInviting(true);
        try {
            if (recipients.length === 1) {
                // One recipient goes out as a text to that number, so the toast has to say what
                // actually happened — on web the link only reached the clipboard.
                const channel = await sendSingle(recipients[0]);
                toast({
                    title: t(
                        channel === 'sms'
                            ? 'inviteFriends.sentSms'
                            : channel === 'clipboard'
                              ? 'inviteFriends.sentClipboard'
                              : 'inviteFriends.sentFailed'
                    ),
                    ...(channel === false && { variant: 'destructive' as const }),
                });
            } else {
                await sendBatch(recipients.map(r => r.phone));
                // The server fans the batch out over SMS itself, so there is nothing to hand off here.
                toast({ title: t('inviteFriends.batchSuccess', { count: recipients.length }) });
            }
            onSent();
        } catch (error) {
            logger.error('INVITE', '[ContactInviteTab] invite failed', { error });
            const message = error instanceof Error ? error.message : t('inviteFriends.batchFailed');
            toast({ title: message, variant: 'destructive' });
        } finally {
            setIsBatchInviting(false);
        }
    };

    if (!active) return null;

    // Not gated on the list having entries: a granted but empty address book is the list's own empty
    // state, not the permission banner.
    const showContactList = isOnMobileApp && !isWaitingForContacts && !permissionDenied;
    const showGuide = !isOnMobileApp || (permissionDenied && !isWaitingForContacts);
    // The list can now come out empty without a search term — every contact received may lack a
    // number. The screen still belongs to the picker (search + link invite), so say why instead of
    // rendering a blank panel.
    const isListEmpty = showContactList && filteredContacts.length === 0;
    const hasSelection = selectedIds.size > 0;

    return (
        <>
            {showContactList && (
                <div className="shrink-0 px-4 pt-2">
                    <SearchInput
                        value={search}
                        onChange={setSearch}
                        placeholder={t('inviteFriends.searchPlaceholder')}
                        label={t('inviteFriends.searchPlaceholder')}
                        trailing={
                            <div className="flex shrink-0 items-center gap-2">
                                {/* Invite by link. This is also the way out of a truncated list:
                                    partial contacts access returns a short list with nothing in the
                                    payload saying so, and a name + number typed here reaches someone
                                    the picker never showed. (The OS settings route stays on the
                                    denied banner; a granted but empty list shows the empty-list
                                    message instead.) */}
                                <button
                                    type="button"
                                    aria-label={t('inviteFriends.sendLink')}
                                    onClick={onRequestLink}
                                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground"
                                >
                                    <IconLink className="size-5" strokeWidth={2} />
                                </button>
                            </div>
                        }
                    />

                    <div className="flex items-center justify-between gap-2 pt-4">
                        <span className="flex items-center gap-2 text-[18px] font-semibold leading-[25px] tracking-[-0.5px] text-foreground">
                            {t('inviteFriends.selectTitle')}
                            <span className="text-placeholder">
                                <span className={hasSelection ? 'text-foreground' : undefined}>{selectedIds.size}</span>
                                /{maxSelection}
                            </span>
                        </span>
                        <button
                            type="button"
                            onClick={clearSelection}
                            disabled={!hasSelection}
                            className="shrink-0 text-[15px] font-medium leading-[25px] tracking-[-0.5px] text-foreground underline disabled:text-placeholder"
                        >
                            {t('inviteFriends.deselectAll')}
                        </button>
                    </div>

                    {hasSelection && (
                        <div className="mb-2 mt-4 h-[90px] overflow-hidden rounded-[8px] bg-secondary">
                            <SelectedAvatarRow
                                items={selectedItems}
                                onRemove={removeSelected}
                                removeLabel={t('inviteFriends.deselectAll')}
                                className="h-full items-center px-3 py-0"
                            />
                        </div>
                    )}
                </div>
            )}

            {showContactList && (
                <div className="flex flex-1 flex-col overflow-y-auto overscroll-none px-2 pt-2">
                    {!isListEmpty && (
                        <p className="px-4 pb-1 text-[14px] leading-[1.4] text-description">
                            {t(query ? 'inviteFriends.searchResultCount' : 'inviteFriends.contactCount', {
                                count: listedCount,
                            })}
                        </p>
                    )}
                    {isListEmpty ? (
                        <div className="flex flex-1 items-center justify-center">
                            <p className="text-center text-[16px] text-description">
                                {t(query ? 'inviteFriends.noSearchResults' : 'inviteFriends.noInvitableContacts')}
                            </p>
                        </div>
                    ) : (
                        filteredContacts.map(contact => {
                            const selected = selectedIds.has(contact.recordID);
                            const hasValidPhone = resolveContactPhone(contact) !== null;
                            const name = nameOf(contact);
                            return (
                                <SelectableUserItem
                                    key={contact.recordID}
                                    name={name}
                                    subtitle={resolveContactSubtitle(contact, name)}
                                    checked={selected}
                                    onToggle={next => handleToggle(contact, next)}
                                    disabled={(!hasValidPhone && !selected) || isBatchInviting}
                                />
                            );
                        })
                    )}
                </div>
            )}

            {showGuide && (
                <div className="flex flex-1 flex-col overflow-y-auto pb-safe-bottom">
                    {isOnMobileApp ? (
                        <PermissionDeniedBanner />
                    ) : (
                        <div className="flex flex-col gap-1 px-5 pb-2 pt-5">
                            <span className="text-[17px] font-medium tracking-[-0.34px] text-foreground">
                                {t('inviteFriends.webGuide.title')}
                            </span>
                            <p className="text-[14px] leading-[1.5] tracking-[-0.07px] text-description">
                                {webGuideDescription ?? t('inviteFriends.webGuide.description')}
                            </p>
                        </div>
                    )}
                    <div className="px-5 pt-4">
                        <Button variant="outline" tone="black" size="md" onClick={onRequestLink}>
                            {t('inviteFriends.sendLink')}
                            <IconLink className="size-[18px]" strokeWidth={2} />
                        </Button>
                    </div>
                </div>
            )}

            {showContactList && (
                <>
                    {/* Docked from the moment the list appears (disabled until something is picked),
                        matching the Figma "완료" CTA. */}
                    <FloatingButton
                        label={t('inviteFriends.done')}
                        loading={isBatchInviting}
                        disabled={!hasSelection}
                        onClick={handleBatchInvite}
                        wrapperClassName="shrink-0"
                    />
                    {/* The CTA panel above only pads itself by `pb-4`; this reserves the home-indicator
                        inset and lifts it above the keyboard raised by the search field. */}
                    <KeyboardSafeAreaSpacer />
                </>
            )}
        </>
    );
};
