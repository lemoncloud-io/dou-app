import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getMobileAppInfo, postMessage, useHandleAppMessage } from '@chatic/app-messages';
import { Dialog, DialogContent } from '@chatic/ui-kit/components/ui/dialog';

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
    const [search, setSearch] = useState('');
    const [addFriendOpen, setAddFriendOpen] = useState(false);
    const [contacts, setContacts] = useState<ContactInfo[]>([]);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [hasRequestedContacts, setHasRequestedContacts] = useState(false);

    const { isOnMobileApp } = getMobileAppInfo();
    const [isWaitingForContacts, setIsWaitingForContacts] = useState(false);

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

    const handleInvite = (contact: ContactInfo) => {
        // TODO: Implement invite API call
        console.log('Invite contact:', contact);
    };

    const showContactList = isOnMobileApp && contacts.length > 0;
    const showPermissionBanner = isOnMobileApp && permissionDenied && !isWaitingForContacts;
    const showNoResults = showContactList && search.trim() && filteredContacts.length === 0;

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-full w-full m-0 rounded-none" hideClose variant="slide-up">
                    <div className="flex flex-col h-full bg-white">
                        {/* Top Bar */}
                        <div className="flex items-center justify-between px-1.5 py-3">
                            <div className="w-11 h-11" />
                            <h1 className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-[#222325]">
                                {t('inviteFriends.title')}
                            </h1>
                            <button
                                onClick={() => onOpenChange?.(false)}
                                className="w-11 h-11 flex items-center justify-center"
                            >
                                <X className="w-6 h-6 text-[#3A3C40]" />
                            </button>
                        </div>

                        {/* Permission Denied Banner */}
                        {showPermissionBanner && <PermissionDeniedBanner />}

                        {/* Quick Actions */}
                        <div className="px-4 pt-5">
                            <div
                                className="flex items-center justify-center gap-[42px] rounded-[20px] py-4 px-[18px]"
                                style={{ boxShadow: '0px 1px 8px 0px rgba(0,0,0,0.08)' }}
                            >
                                {QUICK_ACTIONS.map(({ labelKey, icon, actionKey }) => (
                                    <button
                                        key={actionKey}
                                        className="flex flex-col items-center gap-2"
                                        onClick={() => actionKey === 'addFriend' && setAddFriendOpen(true)}
                                    >
                                        <div
                                            className="w-[42px] h-[42px] rounded-[28px] flex items-center justify-center"
                                            style={{ background: 'rgba(0,43,126,0.06)' }}
                                        >
                                            <img src={icon} alt={t(labelKey)} className="w-[42px] h-[42px]" />
                                        </div>
                                        <span className="text-[15px] font-medium text-black w-16 text-center leading-[1.19] tracking-[-0.02em]">
                                            {t(labelKey)}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Search - Only show when contacts are loaded */}
                        {showContactList && (
                            <div className="px-4 py-[10px]">
                                <div
                                    className="flex items-center gap-[9px] rounded-full px-[14px] py-3"
                                    style={{
                                        background: 'rgba(0,43,126,0.03)',
                                        border: '1px solid rgba(0,43,126,0.01)',
                                    }}
                                >
                                    <Search size={18} className="text-[#3A3C40] shrink-0" />
                                    <input
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        placeholder={t('inviteFriends.searchPlaceholder')}
                                        className="flex-1 bg-transparent text-[16px] text-[#222325] placeholder:text-[#84888F] outline-none leading-[1.19] tracking-[-0.015em]"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Contact List */}
                        {showContactList && (
                            <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-3 pt-2">
                                {showNoResults ? (
                                    <div className="flex-1 flex items-center justify-center">
                                        <p className="text-[16px] font-normal leading-[1.45] tracking-[-0.16px] text-[#84888F] text-center">
                                            {t('inviteFriends.noSearchResults')}
                                        </p>
                                    </div>
                                ) : (
                                    filteredContacts.map(contact => (
                                        <ContactListItem
                                            key={contact.recordID}
                                            contact={contact}
                                            onInvite={handleInvite}
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
