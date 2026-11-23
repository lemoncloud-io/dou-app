import { cn } from '@chatic/ui-kit';

import { BottomSheet } from './BottomSheet';

export interface AudioDetailMoreSheetLabels {
    title: string;
    viewInChat: string;
    replyInThread: string;
    delete: string;
}

export interface AudioDetailMoreSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onViewInChat?: () => void;
    onReplyInThread?: () => void;
    onDelete?: () => void;
    labels?: Partial<AudioDetailMoreSheetLabels>;
    className?: string;
}

const DEFAULT_LABELS: AudioDetailMoreSheetLabels = {
    title: 'More',
    viewInChat: 'View in chat',
    replyInThread: 'Reply in thread',
    delete: 'Delete',
};

interface RowProps {
    label: string;
    onPress: () => void;
    destructive?: boolean;
}

const Row = ({ label, onPress, destructive = false }: RowProps) => (
    <button
        type="button"
        onClick={onPress}
        className={cn(
            'flex w-full items-center rounded-[12px] p-4 text-left text-[16px] font-medium leading-[1.2] transition-colors active:bg-action-soft',
            destructive ? 'text-alert-red' : 'text-foreground'
        )}
    >
        <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
);

export const AudioDetailMoreSheet = ({
    open,
    onOpenChange,
    onViewInChat,
    onReplyInThread,
    onDelete,
    labels,
    className,
}: AudioDetailMoreSheetProps) => {
    const text = { ...DEFAULT_LABELS, ...labels };
    const run = (action: () => void) => () => {
        action();
        onOpenChange(false);
    };

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={text.title}
            hideHeader
            className={cn('rounded-t-[20px]', className)}
        >
            <div className="flex flex-col p-2">
                {onViewInChat && <Row label={text.viewInChat} onPress={run(onViewInChat)} />}
                {onReplyInThread && <Row label={text.replyInThread} onPress={run(onReplyInThread)} />}
                {onDelete && <Row label={text.delete} onPress={run(onDelete)} destructive />}
            </div>
        </BottomSheet>
    );
};
