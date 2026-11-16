import { cn } from '@chatic/ui-kit';

import { BottomSheet } from './BottomSheet';

export interface AudioDetailMoreSheetLabels {
    /** The sheet's accessible name; nothing draws it. */
    title: string;
    viewInChat: string;
    replyInThread: string;
    delete: string;
}

export interface AudioDetailMoreSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Jump to the message in its chat. Omit to hide the row. */
    onViewInChat?: () => void;
    /** Open the message's thread to reply. Omit to hide the row — a room without threads, say. */
    onReplyInThread?: () => void;
    /** Delete the file. Omit to hide the row — the viewer cannot delete it. */
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

/** One row (Figma 6072:22914): 16px text with 16px padding, inside the sheet's own 8px inset. */
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

/**
 * The audio detail's ⋯ sheet (Figma "음성 상세 · 더보기 시트", 6072:22922; screen 6066:22477): a plain
 * list of what else can be done with the file — view it in its chat, reply in its thread, delete it.
 *
 * Each row exists only when the host passes its handler, so the host's permissions decide the list
 * rather than a set of flags beside it. A row closes the sheet after it runs: whatever it starts next
 * (a jump, a confirm dialog) should not open underneath a sheet still standing.
 */
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
