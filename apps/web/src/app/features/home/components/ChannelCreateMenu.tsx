import { useTranslation } from 'react-i18next';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import { IconChatAdd, SubscriptionBadge } from '@chatic/web-ui-kit';

export interface ChannelCreateMenuProps {
    /**
     * ONE create action: the ＋ runs it straight away instead of opening a popover with a single row
     * in it. Given, it replaces the popover entries below.
     */
    onCreate?: () => void;
    /** Accessible name of the ＋ when `onCreate` is given. */
    createLabel?: string;
    /** Show the "1:1 대화" entry. Whether it shows and where the tap goes are the host's call. */
    showOneOnOneCreate?: boolean;
    onCreateOneOnOne?: () => void;
    /** Show the "그룹방 만들기" entry. */
    showGroupCreate?: boolean;
    onCreateGroup?: () => void;
    /** Drives the PRO badge on "그룹방 만들기". */
    isPro?: boolean;
}

/**
 * The ＋ that starts a room — a single button when there is one way to start one, else a popover with
 * the 1:1 and group entries. Shared by a chat section's heading and a cloud home's tab row, so the two
 * offer the same entries the same way. Renders nothing when there is nothing to offer.
 */
export const ChannelCreateMenu = ({
    onCreate,
    createLabel,
    showOneOnOneCreate,
    onCreateOneOnOne,
    showGroupCreate,
    onCreateGroup,
    isPro,
}: ChannelCreateMenuProps) => {
    const { t } = useTranslation();
    if (onCreate) {
        return (
            <button
                type="button"
                aria-label={createLabel ?? t('channelList.createChat')}
                onClick={onCreate}
                className="flex size-6 items-center justify-center text-foreground"
            >
                <IconChatAdd className="size-[18px]" />
            </button>
        );
    }
    // The popover opens for either entry, not for group-create alone: the two rows have separate
    // conditions, so the popover must not hang on just one of them.
    if (!showGroupCreate && !showOneOnOneCreate) return null;
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={t('channelList.createChat')}
                    className="flex size-6 items-center justify-center text-foreground"
                >
                    <IconChatAdd className="size-[18px]" />
                </button>
            </DropdownMenuTrigger>
            {/* Popover metrics are the design's, not the ui-kit menu defaults (Figma 2931:8181):
                the sheet HUGS its rows instead of sitting at a fixed 184px — with one entry that
                left a wide empty gutter — over a translucent, blurred surface with a soft 32px
                shadow, 16px corners, a 6px inner gutter and 12/10px rows. `min-w-0` is what
                releases the kit's 8rem floor; the transform origin makes it scale out of the ＋
                button it belongs to rather than out of its own centre. */}
            <DropdownMenuContent
                align="end"
                sideOffset={6}
                className="min-w-0 origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-2xl border-[0.5px] border-input-border/70 bg-popover/90 p-1.5 shadow-[0_3px_32px_0_rgba(0,0,0,0.08)] backdrop-blur-[4px] duration-150 ease-out"
            >
                {showOneOnOneCreate && (
                    <DropdownMenuItem
                        onClick={onCreateOneOnOne}
                        className="cursor-pointer whitespace-nowrap rounded-[10px] px-3 py-2.5 text-[14px] font-medium leading-4 tracking-[-0.14px]"
                    >
                        {t('channelList.createDirect')}
                    </DropdownMenuItem>
                )}
                {showGroupCreate && (
                    <DropdownMenuItem
                        onClick={onCreateGroup}
                        className="flex cursor-pointer items-center justify-between gap-2 rounded-[10px] px-3 py-2.5 text-[14px] font-medium leading-4 tracking-[-0.14px]"
                    >
                        {/* The design leaves no slack in this row (label + badge fill it exactly), so the
                            label must not wrap. */}
                        <span className="whitespace-nowrap">{t('channelList.createGroup')}</span>
                        {!isPro && <SubscriptionBadge tier="pro" size="xs" />}
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
