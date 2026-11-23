import type { JSX, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import { DefaultAvatar, ImageAvatar } from '@chatic/web-ui-kit';

export interface InAppNotificationCardProps {
    title: string;
    body?: string;
    avatarUrl?: string;
    onClick?: () => void;
}

const AVATAR_SIZE = 38;

export const InAppNotificationCard = ({ title, body, avatarUrl, onClick }: InAppNotificationCardProps): JSX.Element => {
    const { t } = useTranslation();

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick?.();
        }
    };

    return (
        <div
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={onClick ? handleKeyDown : undefined}
            className={cn(
                'pointer-events-auto flex w-full items-center gap-2 overflow-hidden rounded-2xl border border-input-border bg-popover/[0.82] py-[9px] pl-[9px] pr-[14px] text-popover-foreground backdrop-blur-[5px]',
                'shadow-[0_1px_8px_0_rgba(0,0,0,0.08)]',
                onClick && 'cursor-pointer active:opacity-90'
            )}
        >
            <span className="shrink-0">
                {avatarUrl ? (
                    <ImageAvatar src={avatarUrl} alt="" size={AVATAR_SIZE} />
                ) : (
                    <DefaultAvatar size={AVATAR_SIZE} />
                )}
            </span>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                <div className="flex w-full items-center justify-between gap-2">
                    <p className="truncate text-[15px] font-semibold leading-normal tracking-[-0.075px]">{title}</p>
                    <span className="shrink-0 text-[12px] font-medium leading-[14px] tracking-[-0.06px] text-label opacity-50">
                        {t('notifications.inApp.now')}
                    </span>
                </div>
                {body ? (
                    <p className="w-full truncate text-[14px] leading-normal tracking-[-0.07px] text-label">{body}</p>
                ) : null}
            </div>
        </div>
    );
};
