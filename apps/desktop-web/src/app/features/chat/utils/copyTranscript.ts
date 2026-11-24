import { blocksToPlainText, resolveChatBlocks } from '@chatic/block-kit';
import { isPendingUploadSlot, type DomainChat } from '@chatic/runtime';

import { formatClockTime, formatFullDate } from '../../../shared/utils';
import { getTimestamp, messageKeyOf, startOfDay, type MessageRowItem } from './buildMessageRows';

interface TranscriptEntry {
    authorName: string;
    message: DomainChat;
}

const transcriptText = (message: DomainChat, deletedLabel: string): string => {
    if (message.hidden) return deletedLabel;
    const { blocks, source } = resolveChatBlocks(message);
    const text = (!blocks || source === 'field' ? (message.content ?? '') : blocksToPlainText(blocks)).trim();
    if (text) return text;
    return (message.upload$$ ?? [])
        .map(slot => (isPendingUploadSlot(slot) ? slot.localName : slot.name))
        .filter((name): name is string => !!name)
        .join(', ');
};

export const formatTranscript = (entries: readonly TranscriptEntry[], deletedLabel: string): string => {
    const lines: string[] = [];
    let day: number | null = null;
    for (const { authorName, message } of entries) {
        const at = getTimestamp(message);
        if (at && startOfDay(at) !== day) {
            day = startOfDay(at);
            lines.push(formatFullDate(at));
        }
        const time = formatClockTime(at);
        lines.push(`[${authorName}]${time ? ` [${time}]` : ''} ${transcriptText(message, deletedLabel)}`.trimEnd());
    }
    return lines.join('\n');
};

const selectedTextIn = (range: Range, node: HTMLElement): string => {
    const clipped = node.ownerDocument.createRange();
    clipped.selectNodeContents(node);
    if (range.compareBoundaryPoints(Range.START_TO_START, clipped) > 0) {
        clipped.setStart(range.startContainer, range.startOffset);
    }
    if (range.compareBoundaryPoints(Range.END_TO_END, clipped) < 0) {
        clipped.setEnd(range.endContainer, range.endOffset);
    }
    return clipped.toString();
};

export const selectedTranscript = (
    root: HTMLElement,
    selection: Selection | null,
    rows: readonly MessageRowItem[],
    deletedLabel: string
): string | null => {
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const selected = new Set(
        Array.from(root.querySelectorAll<HTMLElement>('[data-message-key]'))
            .filter(node => selectedTextIn(range, node).trim() !== '')
            .map(node => node.dataset.messageKey)
    );
    if (selected.size < 2) return null;
    const entries = rows.flatMap(row =>
        row.kind === 'group'
            ? row.group.messages
                  .filter(message => selected.has(messageKeyOf(message)))
                  .map(message => ({ authorName: row.group.ownerName, message }))
            : []
    );
    return entries.length > 1 ? formatTranscript(entries, deletedLabel) : null;
};
