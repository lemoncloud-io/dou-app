import { IconImageSolid, Text } from '@chatic/web-ui-kit';

import { InviteCard } from './InviteCard';

interface InvitePlaceCardProps {
    name?: string;
    intro?: string;
    thumbnail?: string;
}

export const InvitePlaceCard = ({ name, intro, thumbnail }: InvitePlaceCardProps) => (
    <InviteCard data-testid="invite-place-card">
        {thumbnail ? (
            <img src={thumbnail} alt="" className="size-10 shrink-0 rounded-full object-cover" />
        ) : (
            <IconImageSolid size={40} className="shrink-0 text-brand-ink dark:text-white/80" />
        )}
        <div className="flex w-full flex-col items-center gap-1 text-center">
            {name && (
                <Text
                    as="p"
                    className="break-keep [overflow-wrap:anywhere] text-[16px] font-semibold leading-[1.4] text-foreground"
                >
                    {name}
                </Text>
            )}
            {intro && (
                <Text
                    as="p"
                    className="break-keep [overflow-wrap:anywhere] text-[14px] font-medium leading-[1.4] text-label"
                >
                    {intro}
                </Text>
            )}
        </div>
    </InviteCard>
);
