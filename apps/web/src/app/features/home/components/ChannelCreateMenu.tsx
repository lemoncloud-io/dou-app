import { useTranslation } from 'react-i18next';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import { IconChatAdd, SubscriptionBadge } from '@chatic/web-ui-kit';

export interface ChannelCreateMenuProps {
    onCreate?: () => void;
    createLabel?: string;
    showOneOnOneCreate?: boolean;
    onCreateOneOnOne?: () => void;
    showGroupCreate?: boolean;
    onCreateGroup?: () => void;
    isPro?: boolean;
}

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
                        <span className="whitespace-nowrap">{t('channelList.createGroup')}</span>
                        {!isPro && <SubscriptionBadge tier="pro" size="xs" />}
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
