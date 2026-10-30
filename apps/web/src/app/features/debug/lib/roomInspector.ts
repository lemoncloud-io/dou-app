import type { DomainChat } from '@chatic/data';

import type { DebugRoomObservation } from '../overlay/sharedObservationStore';

/** Which list the Room screen browses: what the bubbles show, or the feed window behind them. */
export type RoomInspectorScope = 'rendered' | 'rows';

/** Rows drawn at once. A room keeps up to a few hundred in memory; the filter reaches all of them. */
export const ROOM_INSPECTOR_LIMIT = 100;

const PREVIEW_LENGTH = 40;

/**
 * The rows to list, newest first by chat number, narrowed by a free-text query over id, chat number and content.
 * `total` is the count before the display limit, so the screen can say how many it left out.
 */
export const listInspectorRows = (
    observation: DebugRoomObservation,
    scope: RoomInspectorScope,
    query: string
): { rows: DomainChat[]; total: number } => {
    const needle = query.trim().toLowerCase();
    const source = scope === 'rendered' ? observation.rendered : observation.rows;
    // Sorted here rather than trusted: the room's two lists do not share an order (the feed window
    // is newest first, the rendered list is in reading order).
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

/** A row the server has not numbered yet is the newest thing in the room, so it sorts on top. */
const sortNo = (chat: DomainChat): number => chat.chatNo || Number.POSITIVE_INFINITY;

/** Looks a message up in either list — a focused row can be one the room filters out. */
export const findInspectorRow = (observation: DebugRoomObservation, id: string): DomainChat | null =>
    observation.rendered.find(chat => chat.id === id) ?? observation.rows.find(chat => chat.id === id) ?? null;

/** States that usually explain a wrong bubble; the screen words them through its string table. */
export type ChatFlag = 'unsent' | 'hidden';

/**
 * One line per row: what it is and the states that usually explain a wrong bubble. A row with no
 * chat number has not been accepted by the server yet (sending, or failed). `stereo` is set only
 * for a row that is not an ordinary user message, and it is the server's value, not a label.
 */
export const summarizeChat = (chat: DomainChat): { label: string; flags: ChatFlag[]; stereo: string | null } => {
    const content = (chat.content ?? '').replace(/\s+/g, ' ').trim();
    const preview = content.length > PREVIEW_LENGTH ? `${content.slice(0, PREVIEW_LENGTH)}…` : content;
    const flags: ChatFlag[] = [];
    if (!chat.chatNo) flags.push('unsent');
    if (chat.hidden) flags.push('hidden');
    const stereo = chat.stereo && chat.stereo !== 'user' ? chat.stereo : null;
    return { label: `#${chat.chatNo ?? 0} ${preview}`.trim(), flags, stereo };
};

/**
 * Pretty JSON for a row as it is held. Never throws: a value that cannot be serialized says so in
 * place of the dump, because the inspector is opened precisely when data looks wrong.
 */
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
