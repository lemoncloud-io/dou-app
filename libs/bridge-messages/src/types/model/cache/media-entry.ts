export type ChatMediaKind = 'image' | 'video' | 'file' | 'audio' | 'link';

export const CHAT_MEDIA_KINDS: readonly ChatMediaKind[] = ['image', 'video', 'file', 'audio', 'link'];

export interface ChatMediaEntry {
    kind: ChatMediaKind;
    idx: number;
    ref: string;
}

export type ChatMediaCounts = Record<ChatMediaKind, number>;
