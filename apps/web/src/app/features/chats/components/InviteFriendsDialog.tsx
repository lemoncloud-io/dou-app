import { ChevronLeft, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ContactInfo } from '@chatic/app-messages';
import { getMobileAppInfo, postMessage, useHandleAppMessage } from '@chatic/app-messages';
import { reportError, toError } from '@chatic/web-core';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useCreateInvite } from '../hooks';

import { AddFriendSheet } from './AddFriendSheet';
import { ContactListItem } from './ContactListItem';
import { PermissionDeniedBanner } from './PermissionDeniedBanner';

// Valid Korean mobile prefixes: 010, 011, 016, 017, 018, 019
const KOREAN_MOBILE_PREFIXES = ['010', '011', '016', '017', '018', '019'];

const isValidKoreanPhone = (digits: string): boolean => {
    if (digits.length < 10 || digits.length > 11) return false;
    return KOREAN_MOBILE_PREFIXES.some(prefix => digits.startsWith(prefix));
};

interface InviteFriendsDialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    channelId?: string;
}

export const InviteFriendsDialog = ({ open, onOpenChange, channelId }: InviteFriendsDialogProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [search, setSearch] = useState('');
    const [addFriendOpen, setAddFriendOpen] = useState(false);
    const [contacts, setContacts] = useState<ContactInfo[]>([]);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [hasRequestedContacts, setHasRequestedContacts] = useState(false);
    const [invitingContactId, setInvitingContactId] = useState<string | null>(null);

    const { isOnMobileApp } = getMobileAppInfo();
    const [isWaitingForContacts, setIsWaitingForContacts] = useState(false);
    const { createInvite } = useCreateInvite();

    // Listen for contact response from native app
    useHandleAppMessage('OnGetContacts', message => {
        setIsWaitingForContacts(false);
        const receivedContacts = message.data?.contacts ?? [];
        if (receivedContacts.length > 0) {
            setContacts(receivedContacts);
            setPermissionDenied(false);
        } else {
            setContacts([]);
            setPermissionDenied(true);
        }
    });

    // Request contacts when dialog opens (mobile only)
    useEffect(() => {
        if (open && isOnMobileApp && !hasRequestedContacts) {
            postMessage({ type: 'GetContacts' });
            setHasRequestedContacts(true);
            setIsWaitingForContacts(true);
        }
    }, [open, isOnMobileApp, hasRequestedContacts]);

    // Timeout: If no response after 3 seconds, assume permission denied
    // (Android may take longer to fetch contacts on slower devices)
    useEffect(() => {
        if (!isWaitingForContacts) return;

        const timeoutId = setTimeout(() => {
            if (isWaitingForContacts && contacts.length === 0) {
                setIsWaitingForContacts(false);
                setPermissionDenied(true);
            }
        }, 3000);

        return () => clearTimeout(timeoutId);
    }, [isWaitingForContacts, contacts.length]);

    // Reset state when dialog closes
    useEffect(() => {
        if (!open) {
            setSearch('');
            setHasRequestedContacts(false);
            setIsWaitingForContacts(false);
            setPermissionDenied(false);
            setContacts([]);
        }
    }, [open]);

    // Filter contacts based on search
    const filteredContacts = useMemo(() => {
        if (!search.trim()) return contacts;

        const searchLower = search.toLowerCase();
        return contacts.filter(contact => {
            const displayName = contact.displayName?.toLowerCase() ?? '';
            const givenName = contact.givenName?.toLowerCase() ?? '';
            const familyName = contact.familyName?.toLowerCase() ?? '';
            return (
                displayName.includes(searchLower) || givenName.includes(searchLower) || familyName.includes(searchLower)
            );
        });
    }, [contacts, search]);

    const handleInvite = async (contact: ContactInfo) => {
        if (!channelId || invitingContactId) return;

        // Extract first phone number and filter to digits only
        const phoneNumber = contact.phoneNumbers?.[0]?.number;
        if (!phoneNumber) {
            toast({ title: t('inviteFriends.shareFailed'), variant: 'destructive' });
            return;
        }
        const phone = phoneNumber.replace(/\D/g, '');

        // Validate Korean phone number
        if (!isValidKoreanPhone(phone)) {
            toast({ title: t('addFriend.phoneInvalidFormat'), variant: 'destructive' });
            return;
        }

        // Determine name (displayName > givenName familyName > Unknown)
        const name =
            contact.displayName || `${contact.givenName || ''} ${contact.familyName || ''}`.trim() || 'Unknown';

        setInvitingContactId(contact.recordID);

        try {
            const { deeplinkUrl } = await createInvite({
                channelId,
                name,
                phone,
            });

            if (isOnMobileApp) {
                // Mobile app: Use native share sheet (clipboard not reliable in WebView)
                postMessage({
                    type: 'OpenShareSheet',
                    data: {
                        title: t('inviteFriends.shareTitle'),
                        message: `${t('inviteFriends.shareMessage')}\n${deeplinkUrl}`,
                    },
                });
            } else {
                // Browser: Copy to clipboard only
                await navigator.clipboard.writeText(deeplinkUrl);
                toast({ title: t('inviteFriends.linkCopied') });
            }
        } catch (error) {
            console.error('Failed to invite contact:', error);
            reportError(toError(error));
            const message = error instanceof Error ? error.message : t('inviteFriends.shareFailed');
            toast({ title: message, variant: 'destructive' });
        } finally {
            setInvitingContactId(null);
        }
    };

    const showContactList = isOnMobileApp && contacts.length > 0;
    const showPermissionBanner = isOnMobileApp && permissionDenied && !isWaitingForContacts;
    const showNoResults = showContactList && search.trim() && filteredContacts.length === 0;

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className="m-0 w-full max-w-full rounded-none bg-background"
                    hideClose
                    variant="slide-up"
                    aria-describedby={undefined}
                >
                    <DialogDescription className="sr-only">Invite friends to this channel</DialogDescription>

                    <div className="flex h-full flex-col overflow-hidden bg-background">
                        <div className="shrink-0">
                            <div className="flex items-center justify-between px-1.5 py-3">
                                <button
                                    onClick={() => onOpenChange?.(false)}
                                    className="flex h-11 w-11 items-center justify-center"
                                >
                                    <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
                                </button>
                                <DialogTitle className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-foreground">
                                    {t('inviteFriends.title')}
                                </DialogTitle>
                                <div className="h-11 w-11" />
                            </div>

                            {showPermissionBanner && <PermissionDeniedBanner />}

                            <div className="px-4 pt-5">
                                <div className="flex items-center justify-center rounded-[20px] border border-border bg-card px-[18px] py-5 shadow-sm">
                                    <button
                                        className="flex flex-col items-center gap-2"
                                        onClick={() => setAddFriendOpen(true)}
                                    >
                                        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-muted">
                                            <img
                                                src="/assets/icons/icon-user-plus.svg"
                                                alt={t('inviteFriends.addFriend')}
                                                className="h-7 w-7 dark:brightness-0 dark:invert"
                                            />
                                        </div>
                                        <span className="text-center text-[15px] font-medium leading-[1.19] tracking-[-0.02em] text-foreground">
                                            {t('inviteFriends.addFriend')}
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {showContactList && (
                                <div className="px-4 py-[10px]">
                                    <div className="flex items-center gap-[9px] rounded-full border border-border bg-muted px-[14px] py-3">
                                        <Search size={18} className="shrink-0 text-foreground" />
                                        <input
                                            value={search}
                                            onChange={e => setSearch(e.target.value)}
                                            placeholder={t('inviteFriends.searchPlaceholder')}
                                            className="flex-1 bg-transparent text-[16px] leading-[1.19] tracking-[-0.015em] text-foreground placeholder:text-muted-foreground outline-none"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {showContactList && (
                            <div className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-none px-4 pt-2">
                                {showNoResults ? (
                                    <div className="flex flex-1 items-center justify-center">
                                        <p className="text-center text-[16px] font-normal leading-[1.45] tracking-[-0.16px] text-muted-foreground">
                                            {t('inviteFriends.noSearchResults')}
                                        </p>
                                    </div>
                                ) : (
                                    filteredContacts.map(contact => (
                                        <ContactListItem
                                            key={contact.recordID}
                                            contact={contact}
                                            onInvite={handleInvite}
                                            isLoading={invitingContactId === contact.recordID}
                                        />
                                    ))
                                )}
                            </div>
                        )}

                        <div
                            className="shrink-0 touch-none bg-background"
                            style={{
                                height: `calc( var(--keyboard-height, 0px))`,
                            }}
                            onTouchMove={e => e.preventDefault()}
                        />
                    </div>
                </DialogContent>
            </Dialog>

            <AddFriendSheet open={addFriendOpen} onOpenChange={setAddFriendOpen} channelId={channelId} />
        </>
    );
};
