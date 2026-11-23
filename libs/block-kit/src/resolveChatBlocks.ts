import { parseBlocks, toBlocks, type KnownBlock } from './blockKit';

type ChatBlocksSource = 'field' | 'content';

interface ResolvedChatBlocks {
    blocks: KnownBlock[] | null;
    source: ChatBlocksSource | null;
}

export const resolveChatBlocks = (chat: {
    content?: string;
    blocks$?: unknown;
    stereo?: string;
}): ResolvedChatBlocks => {
    if (chat.stereo !== 'webhook') return { blocks: null, source: null };
    const field = chat.blocks$;
    if (Array.isArray(field) && field.length) {
        return { blocks: toBlocks(field), source: 'field' };
    }
    const blocks = parseBlocks(chat.content);
    return { blocks, source: blocks ? 'content' : null };
};
