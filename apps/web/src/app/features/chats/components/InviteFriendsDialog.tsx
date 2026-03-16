import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getMobileAppInfo, postMessage, useHandleAppMessage } from '@chatic/app-messages';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useCreateInvite } from '../hooks/useCreateInvite';

import { AddFriendSheet } from './AddFriendSheet';
import { ContactListItem } from './ContactListItem';
import { PermissionDeniedBanner } from './PermissionDeniedBanner';

import type { ContactInfo } from '@chatic/app-messages';

interface InviteFriendsDialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    channelId?: string;
}

const QUICK_ACTIONS = [
    { labelKey: 'inviteFriends.copyLink', icon: '/assets/icons/icon-link.svg', actionKey: 'copyLink' },
    { labelKey: 'inviteFriends.addFriend', icon: '/assets/icons/icon-user-plus.svg', actionKey: 'addFriend' },
    { labelKey: 'inviteFriends.qrCode', icon: '/assets/icons/icon-qr.svg', actionKey: 'qrCode' },
] as const;

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

    // Timeout: If no response after 1 second, assume permission denied
    useEffect(() => {
        if (!isWaitingForContacts) return;

        const timeoutId = setTimeout(() => {
            if (isWaitingForContacts && contacts.length === 0) {
                setIsWaitingForContacts(false);
                setPermissionDenied(true);
            }
        }, 1000);

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
                    className="max-w-full w-full m-0 rounded-none bg-background"
                    hideClose
                    variant="slide-up"
                >
                    <DialogDescription className="sr-only">Invite friends to this channel</DialogDescription>
                    <div className="flex flex-col h-full bg-background">
                        {/* Top Bar */}
                        <div className="flex items-center justify-between px-1.5 py-3">
                            <div className="w-11 h-11" />
                            <DialogTitle className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-foreground">
                                {t('inviteFriends.title')}
                            </DialogTitle>
                            <button
                                onClick={() => onOpenChange?.(false)}
                                className="w-11 h-11 flex items-center justify-center"
                            >
                                <X className="w-6 h-6 text-foreground" />
                            </button>
                        </div>

                        {/* Permission Denied Banner */}
                        {showPermissionBanner && <PermissionDeniedBanner />}

                        {/* Quick Actions */}
                        <div className="px-4 pt-5">
                            <div className="flex items-center justify-center gap-[42px] rounded-[20px] py-4 px-[18px] bg-card shadow-sm border border-border">
                                {QUICK_ACTIONS.map(({ labelKey, icon, actionKey }) => (
                                    <button
                                        key={actionKey}
                                        className="flex flex-col items-center gap-2"
                                        onClick={() => actionKey === 'addFriend' && setAddFriendOpen(true)}
                                    >
                                        <div className="w-[42px] h-[42px] rounded-[28px] flex items-center justify-center bg-muted">
                                            <img
                                                src={icon}
                                                alt={t(labelKey)}
                                                className="w-[42px] h-[42px] dark:invert dark:brightness-200"
                                            />
                                        </div>
                                        <span className="text-[15px] font-medium text-foreground w-16 text-center leading-[1.19] tracking-[-0.02em]">
                                            {t(labelKey)}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Search - Only show when contacts are loaded */}
                        {showContactList && (
                            <div className="px-4 py-[10px]">
                                <div className="flex items-center gap-[9px] rounded-full px-[14px] py-3 bg-muted border border-border">
                                    <Search size={18} className="text-foreground shrink-0" />
                                    <input
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        placeholder={t('inviteFriends.searchPlaceholder')}
                                        className="flex-1 bg-transparent text-[16px] text-foreground placeholder:text-muted-foreground outline-none leading-[1.19] tracking-[-0.015em]"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Contact List */}
                        {showContactList && (
                            <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-3 pt-2">
                                {showNoResults ? (
                                    <div className="flex-1 flex items-center justify-center">
                                        <p className="text-[16px] font-normal leading-[1.45] tracking-[-0.16px] text-muted-foreground text-center">
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
                    </div>
                </DialogContent>
            </Dialog>

            <AddFriendSheet open={addFriendOpen} onOpenChange={setAddFriendOpen} channelId={channelId} />
        </>
    );
};
