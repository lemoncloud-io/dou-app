import { IconImageSolid, Text } from '@chatic/web-ui-kit';

import { InviteCard } from './InviteCard';

interface InvitePlaceCardProps {
    /** Invited place name. */
    name?: string;
    /** Intro copy (backend-provided; hidden when absent). */
    intro?: string;
    /** Place thumbnail (base64/url); falls back to the picture-placeholder glyph. */
    thumbnail?: string;
}

/**
 * Invite accept screen — the invited place block: avatar + name + optional intro. The thumbnail and
 * intro come from backend-denormalized invite metadata; both degrade gracefully when missing.
 */
export const InvitePlaceCard = ({ name, intro, thumbnail }: InvitePlaceCardProps) => (
    // testid: whether this card exists at all is the group / 1:1 difference (ADR-0037), and asserting
    // on its copy alone can't tell "card absent" from "card present but empty".
    <InviteCard data-testid="invite-place-card">
        {thumbnail ? (
            <img src={thumbnail} alt="" className="size-10 shrink-0 rounded-full object-cover" />
        ) : (
            // No thumbnail: the Figma picture-placeholder glyph, which carries its own disc with the
            // photo motif knocked out — hence no coloured wrapper here. Because the motif is a
            // cut-out, the glyph colour must contrast with the card *behind* it: brand-ink over the
            // light glass is 14:1, but only 1.2:1 over the dark card, so dark mode inverts to a light
            // disc with a dark motif (8.7:1).
            <IconImageSolid size={40} className="shrink-0 text-brand-ink dark:text-white/80" />
        )}
        <div className="flex w-full flex-col items-center gap-1 text-center">
            {name && (
                <Text as="p" className="break-keep text-[16px] font-semibold leading-[1.4] text-foreground">
                    {name}
                </Text>
            )}
            {intro && (
                <Text as="p" className="break-keep text-[14px] font-medium leading-[1.4] text-label">
                    {intro}
                </Text>
            )}
        </div>
    </InviteCard>
);
