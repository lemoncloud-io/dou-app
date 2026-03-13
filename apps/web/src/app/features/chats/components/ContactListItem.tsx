import { Loader2, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ContactInfo } from '@chatic/app-messages';

interface ContactListItemProps {
    contact: ContactInfo;
    onInvite: (contact: ContactInfo) => void;
    isLoading?: boolean;
}

export const ContactListItem = ({ contact, onInvite, isLoading }: ContactListItemProps) => {
    const { t } = useTranslation();

    const displayName =
        contact.displayName || `${contact.givenName} ${contact.familyName}`.trim() || t('chat.room.unknown');

    return (
        <div className="flex items-center gap-2">
            {/* Avatar */}
            <div className="size-10 rounded-full border border-[#F4F5F5] bg-[rgba(0,43,126,0.04)] flex items-center justify-center overflow-hidden shrink-0">
                {contact.hasThumbnail && contact.thumbnailPath ? (
                    <img src={contact.thumbnailPath} alt={displayName} className="size-full object-cover" />
                ) : (
                    <User className="size-3.5 text-[#3A3C40]" />
                )}
            </div>

            {/* Name & Invite */}
            <div className="flex flex-1 items-center">
                <span className="flex-1 text-[16px] font-medium leading-[22px] tracking-[0.08px] text-[#222325]">
                    {displayName}
                </span>
                <button
                    onClick={() => onInvite(contact)}
                    disabled={isLoading}
                    className="text-[14px] font-semibold leading-[22px] tracking-[0.07px] text-[#102346] underline disabled:opacity-50"
                >
                    {isLoading ? <Loader2 className="size-4 animate-spin" /> : t('inviteFriends.invite')}
                </button>
            </div>
        </div>
    );
};
