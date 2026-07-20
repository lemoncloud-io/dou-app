import { PlaceAvatar, Text } from '@chatic/web-ui-kit';

import { InviteCard } from './InviteCard';

interface InvitePlaceCardProps {
    /** Invited place name. */
    name?: string;
    /** Intro copy (backend-provided; hidden when absent). */
    intro?: string;
    /** Place thumbnail (base64/url); falls back to the generic PlaceAvatar. */
    thumbnail?: string;
}

/**
 * Invite accept screen — the invited place block: avatar + name + optional intro. The thumbnail and
 * intro come from backend-denormalized invite metadata; both degrade gracefully when missing.
 */
export const InvitePlaceCard = ({ name, intro, thumbnail }: InvitePlaceCardProps) => (
    <InviteCard>
        {thumbnail ? (
            <img src={thumbnail} alt="" className="size-10 shrink-0 rounded-full object-cover" />
        ) : (
            <PlaceAvatar name={name} size="md" />
        )}
        <div className="flex w-full flex-col items-center gap-1 text-center">
            {name && (
                <Text as="p" className="break-keep text-[16px] font-semibold leading-[1.4] text-foreground">
                    {name}
                </Text>
            )}
            {intro && (
                <Text as="p" className="break-keep text-[14px] font-medium leading-[1.4] text-description">
                    {intro}
                </Text>
            )}
        </div>
    </InviteCard>
);
