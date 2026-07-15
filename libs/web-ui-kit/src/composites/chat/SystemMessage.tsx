import { cn } from '@chatic/lib/utils';

export interface SystemMessageProps {
    /** Bold notice line (e.g. "<친구>님이 채팅방에 입장했습니다."). */
    title: string;
    /** Optional supporting line (e.g. "1:1 대화를 시작해 보세요."). */
    description?: string;
    className?: string;
}

/**
 * In-room system notice — the Figma chat-entry banner: a bold notice with an
 * optional supporting line, rendered inline in the message stream.
 */
export const SystemMessage = ({ title, description, className }: SystemMessageProps) => {
    return (
        <div className={cn('flex w-full flex-col gap-1 px-4 py-2', className)}>
            <p className="text-[16px] font-semibold leading-[22px] tracking-[-0.08px] text-foreground">{title}</p>
            {description && <p className="text-[15px] leading-5 tracking-[-0.075px] text-label">{description}</p>}
        </div>
    );
};
