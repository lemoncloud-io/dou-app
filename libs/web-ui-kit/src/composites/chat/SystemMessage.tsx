import { cn } from '@chatic/lib/utils';

export interface SystemMessageProps {
    /** Bold notice line (e.g. "<친구>님이 채팅방에 입장했습니다."). */
    title: string;
    /** Optional supporting line (e.g. "1:1 대화를 시작해 보세요."). */
    description?: string;
    className?: string;
}

/**
 * In-room intro/notice block — the Figma chat-entry banner (`3086:14439`): a bold notice with an
 * optional supporting line, left-aligned inline in the message stream.
 *
 * Used for the 1:1 entry notice and the self-chat intro, both of which sit pinned above the oldest
 * message group rather than scrolling away with it.
 */
export const SystemMessage = ({ title, description, className }: SystemMessageProps) => {
    return (
        <div className={cn('flex w-full flex-col items-start gap-1.5 px-4 pb-2 pt-2.5', className)}>
            <p className="text-[18px] font-semibold leading-[26px] tracking-[-0.09px] text-foreground">{title}</p>
            {description && <p className="text-[16px] leading-[22px] tracking-[-0.08px] text-label">{description}</p>}
        </div>
    );
};
