import { Check, User } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ContactInfo } from '@chatic/app-messages';

interface ContactListItemProps {
    contact: ContactInfo;
    selected?: boolean;
    onToggle?: (contact: ContactInfo) => void;
    disabled?: boolean;
}

export const ContactListItem = ({ contact, selected, onToggle, disabled }: ContactListItemProps) => {
    const { t } = useTranslation();
    const [imgError, setImgError] = useState(false);

    const displayName =
        contact.displayName || `${contact.givenName} ${contact.familyName}`.trim() || t('chat.room.unknown');

    return (
        <button
            type="button"
            onClick={() => !disabled && onToggle?.(contact)}
            disabled={disabled}
            className="flex w-full items-center gap-2 disabled:opacity-50"
        >
            {/* Avatar */}
            <div className="size-10 rounded-full border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {contact.hasThumbnail && contact.thumbnailPath && !imgError ? (
                    <img
                        src={contact.thumbnailPath}
                        alt={displayName}
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover"
                        onError={() => setImgError(true)}
                    />
                ) : (
                    <User className="size-3.5 text-muted-foreground" />
                )}
            </div>

            {/* Name & Check */}
            <div className="flex flex-1 items-center">
                <span className="flex-1 text-left text-[16px] font-medium leading-[22px] tracking-[0.08px] text-foreground">
                    {displayName}
                </span>
                <div
                    className={`size-6 rounded-full flex items-center justify-center shrink-0 ${
                        selected ? 'bg-primary' : 'border border-border bg-background'
                    }`}
                >
                    {selected && <Check className="size-4 text-primary-foreground" />}
                </div>
            </div>
        </button>
    );
};
