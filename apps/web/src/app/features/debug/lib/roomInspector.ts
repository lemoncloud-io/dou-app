import type { DomainChat } from '@chatic/runtime-react';

import type { DebugRoomObservation } from '../overlay/sharedObservationStore';

export type RoomInspectorScope = 'rendered' | 'rows';

export const ROOM_INSPECTOR_LIMIT = 100;

const PREVIEW_LENGTH = 40;

export const listInspectorRows = (
    observation: DebugRoomObservation,
    scope: RoomInspectorScope,
    query: string
): { rows: DomainChat[]; total: number } => {
    const needle = query.trim().toLowerCase();
    const source = scope === 'rendered' ? observation.rendered : observation.rows;
    const matched = [...source]
        .sort((a, b) => sortNo(b) - sortNo(a))
        .filter(
            chat =>
                !needle ||
                chat.id?.toLowerCase().includes(needle) ||
                String(chat.chatNo ?? '') === needle ||
                (chat.content ?? '').toLowerCase().includes(needle)
        );
    return { rows: matched.slice(0, ROOM_INSPECTOR_LIMIT), total: matched.length };
};

const sortNo = (chat: DomainChat): number => chat.chatNo || Number.POSITIVE_INFINITY;

export const findInspectorRow = (observation: DebugRoomObservation, id: string): DomainChat | null =>
    observation.rendered.find(chat => chat.id === id) ?? observation.rows.find(chat => chat.id === id) ?? null;

export type ChatFlag = 'unsent' | 'hidden';

export const summarizeChat = (chat: DomainChat): { label: string; flags: ChatFlag[]; stereo: string | null } => {
    const content = (chat.content ?? '').replace(/\s+/g, ' ').trim();
    const preview = content.length > PREVIEW_LENGTH ? `${content.slice(0, PREVIEW_LENGTH)}…` : content;
    const flags: ChatFlag[] = [];
    if (!chat.chatNo) flags.push('unsent');
    if (chat.hidden) flags.push('hidden');
    const stereo = chat.stereo && chat.stereo !== 'user' ? chat.stereo : null;
    return { label: `#${chat.chatNo ?? 0} ${preview}`.trim(), flags, stereo };
};

export const toRawJson = (value: unknown): string => {
    if (value === undefined) return 'undefined';
    try {
        return JSON.stringify(
            value,
            (_key, item: unknown) => (item instanceof Map ? Object.fromEntries(item) : item),
            2
        );
    } catch (error) {
        return `[unserializable: ${error instanceof Error ? error.message : String(error)}]`;
    }
};
