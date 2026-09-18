import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router-dom';

import type { ContactInfo } from '@chatic/app-messages';
import { isNative, logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import {
    Button,
    FloatingButton,
    IconLink,
    SearchInput,
    SegmentedTabs,
    SelectableUserItem,
    SelectedAvatarRow,
} from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { appBridge } from '../../../bridge';
import { PageHeader } from '../../../ui/components';
import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
import { useChannel, useCreateInviteBatch } from '../hooks';
import { AddFriendSheet } from '../components/AddFriendSheet';
import { PlaceInviteTab } from '../components/PlaceInviteTab';
import { PermissionDeniedBanner } from '../components/PermissionDeniedBanner';
import {
    contactSearchText,
    resolveContactDisplayPhone,
    resolveContactName,
    resolveContactPhone,
} from '../utils/deviceContact';
import { getRoomDistance } from '../utils/roomDistance';

/** A single invite batch selects at most this many friends. Shared with the place tab. */
const MAX_INVITE_SELECTION = 100;

type InviteTab = 'place' | 'contact';

/**
 * The channel friend-invite page — converted from the previous InviteFriendsDialog into a
 * routed page.
 * Native: multi-select device contacts for a batch invite. Web: no contacts access → funneled
 * into the invite-link flow.
 */
export const InvitePage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const { channelId } = useParams<{ channelId: string }>();
    // Reached from the room directly (1 hop) or via settings (2); default to the direct case.
    const roomDistance = getRoomDistance(useLocation().state, 1);

    const isOnMobileApp = isNative();
    // Place first: most people worth adding are already here, and on web the contact tab is only a
    // link-invite prompt (there is no device contacts access). See ADR-0075.
    const [activeTab, setActiveTab] = useState<InviteTab>('place');
    const { channel } = useChannel(channelId ?? null);
    const [search, setSearch] = useState('');
    const [addFriendOpen, setAddFriendOpen] = useState(false);
    const [contacts, setContacts] = useState<ContactInfo[]>([]);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [isWaitingForContacts, setIsWaitingForContacts] = useState(isOnMobileApp);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBatchInviting, setIsBatchInviting] = useState(false);

    const { createSingleInvite, createBatchInvite } = useCreateInviteBatch();

    // Bound here because the chain's last resort is a translated label: a contact with no name, no
    // company and no number would otherwise render as an empty row (see resolveContactName).
    const nameOf = useCallback(
        (contact: ContactInfo) => resolveContactName(contact, t('inviteFriends.unnamedContact')),
        [t]
    );

    /**
     * Loads contacts only on native. Web has no contacts access → funneled into the invite link.
     *
     * Only called once the contact tab is actually entered. `getContacts()` raises the OS
     * permission popup, and now that the default tab is place, calling it on mount would
     * **prompt for permission even from a user with no intention of using contacts.**
     *
     * The trigger is **has it ever been opened** (`contactsRequested`), not `activeTab` directly.
     * Depending directly on the tab value would run cleanup when the tab is flipped back, which
     * cancels the in-flight request — and if the response arrives in that window, no state ever
     * gets set and only the re-request guard remains, leaving the contacts tab permanently blank.
     * This flag only ever flips false→true once, so the effect runs once too, and cleanup only
     * runs on unmount.
     */
    const [contactsRequested, setContactsRequested] = useState(false);
    useEffect(() => {
        if (activeTab === 'contact') setContactsRequested(true);
    }, [activeTab]);

    useEffect(() => {
        if (!isOnMobileApp || !contactsRequested) return;
        let cancelled = false;
        setIsWaitingForContacts(true);
        appBridge
            .getContacts()
            .then(response => {
                if (cancelled) return;
                const received = response.data?.contacts ?? [];
                setIsWaitingForContacts(false);
                if (received.length > 0) {
                    setContacts(received);
                    setPermissionDenied(false);
                } else {
                    setPermissionDenied(true);
                }
            })
            .catch(() => {
                if (cancelled) return;
                setIsWaitingForContacts(false);
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
    const listedContacts = useMemo(() => contacts.filter(c => resolveContactDisplayPhone(c) !== ''), [contacts]);

    // Selected contacts stay at the top regardless of the filter; the rest get the search filter applied.
    const filteredContacts = useMemo(() => {
        const selected: ContactInfo[] = [];
        const unselected: ContactInfo[] = [];
        for (const contact of listedContacts) {
            (selectedIds.has(contact.recordID) ? selected : unselected).push(contact);
        }
        let rest = unselected;
        if (search.trim()) {
            const q = search.toLowerCase();
            rest = unselected.filter(c => contactSearchText(c).includes(q));
        }
        return [...selected, ...rest];
    }, [listedContacts, search, selectedIds]);

    const selectedItems = useMemo(
        () => listedContacts.filter(c => selectedIds.has(c.recordID)).map(c => ({ id: c.recordID, name: nameOf(c) })),
        [listedContacts, selectedIds, nameOf]
    );

    const handleToggle = useCallback(
        (contact: ContactInfo, next: boolean) => {
            if (isBatchInviting) return;
            setSelectedIds(prev => {
                if (next && prev.size >= MAX_INVITE_SELECTION && !prev.has(contact.recordID)) {
                    toast({ title: t('inviteFriends.limitToast', { max: MAX_INVITE_SELECTION }) });
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
        [isBatchInviting, toast, t]
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
        if (!channelId || selectedIds.size === 0 || isBatchInviting) return;

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
                const { channel } = await createSingleInvite({
                    channelId,
                    name: recipients[0].name,
                    phone: recipients[0].phone,
                });
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
                await createBatchInvite({ channelId, phones: recipients.map(r => r.phone) });
                // The server fans the batch out over SMS itself, so there is nothing to hand off here.
                toast({ title: t('inviteFriends.batchSuccess', { count: recipients.length }) });
            }
            navigate(-1);
        } catch (error) {
            logger.error('INVITE', '[InvitePage] invite failed', { error });
            const message = error instanceof Error ? error.message : t('inviteFriends.batchFailed');
            toast({ title: message, variant: 'destructive' });
        } finally {
            setIsBatchInviting(false);
        }
    };

    const showContactList = isOnMobileApp && contacts.length > 0;
    const showGuide = !isOnMobileApp || (permissionDenied && !isWaitingForContacts);
    // The list can now come out empty without a search term — every contact received may lack a
    // number. The screen still belongs to the picker (search + link invite), so say why instead of
    // rendering a blank panel.
    const isListEmpty = showContactList && filteredContacts.length === 0;
    const hasSelection = selectedIds.size > 0;

    const tabs = [
        { id: 'place', label: t('inviteFriends.tabPlace') },
        { id: 'contact', label: t('inviteFriends.tabContact') },
    ];
    const isContactTab = activeTab === 'contact';

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader title={t('inviteFriends.selectTitle')} />

            <SegmentedTabs items={tabs} value={activeTab} onChange={id => setActiveTab(id as InviteTab)} />

            {/* Each tab keeps its own selection and its own confirm action, so they are separate
                subtrees rather than one body with a switch inside — see ADR-0075. */}
            {!isContactTab && channelId && (
                <PlaceInviteTab channelId={channelId} sid={channel?.sid ?? null} maxSelection={MAX_INVITE_SELECTION} />
            )}

            {isContactTab && showContactList && (
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
                                    empty/denied banner, which is where a blank list lands.) */}
                                <button
                                    type="button"
                                    aria-label={t('inviteFriends.sendLink')}
                                    onClick={() => setAddFriendOpen(true)}
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
                                /{MAX_INVITE_SELECTION}
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

            {isContactTab && showContactList && (
                <div className="flex flex-1 flex-col overflow-y-auto overscroll-none px-2 pt-2">
                    {isListEmpty ? (
                        <div className="flex flex-1 items-center justify-center">
                            <p className="text-center text-[16px] text-description">
                                {t(
                                    search.trim()
                                        ? 'inviteFriends.noSearchResults'
                                        : 'inviteFriends.noInvitableContacts'
                                )}
                            </p>
                        </div>
                    ) : (
                        filteredContacts.map(contact => {
                            const selected = selectedIds.has(contact.recordID);
                            const hasValidPhone = resolveContactPhone(contact) !== null;
                            return (
                                <SelectableUserItem
                                    key={contact.recordID}
                                    name={nameOf(contact)}
                                    checked={selected}
                                    onToggle={next => handleToggle(contact, next)}
                                    disabled={(!hasValidPhone && !selected) || isBatchInviting}
                                />
                            );
                        })
                    )}
                </div>
            )}

            {isContactTab && showGuide && (
                <div className="flex flex-1 flex-col overflow-y-auto pb-safe-bottom">
                    {isOnMobileApp ? (
                        <PermissionDeniedBanner />
                    ) : (
                        <div className="flex flex-col gap-1 px-5 pb-2 pt-5">
                            <span className="text-[17px] font-medium tracking-[-0.34px] text-foreground">
                                {t('inviteFriends.webGuide.title')}
                            </span>
                            <p className="text-[14px] leading-[1.5] tracking-[-0.07px] text-description">
                                {t('inviteFriends.webGuide.description')}
                            </p>
                        </div>
                    )}
                    <div className="px-5 pt-4">
                        <Button variant="outline" tone="black" size="md" onClick={() => setAddFriendOpen(true)}>
                            {t('inviteFriends.sendLink')}
                            <IconLink className="size-[18px]" strokeWidth={2} />
                        </Button>
                    </div>
                </div>
            )}

            {isContactTab && showContactList && (
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

            <AddFriendSheet
                open={addFriendOpen}
                onOpenChange={setAddFriendOpen}
                channelId={channelId}
                roomDistance={roomDistance}
            />
        </div>
    );
};
