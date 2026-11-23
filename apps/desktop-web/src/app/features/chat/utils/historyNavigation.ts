import type { HistoryDirection } from '../stores/useHistoryRequestStore';

export const historyChord = (event: {
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    key: string;
    code?: string;
}): HistoryDirection | null => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return null;
    if (event.code === 'BracketLeft' || event.key === '[') return 'back';
    if (event.code === 'BracketRight' || event.key === ']') return 'forward';
    return null;
};

export const historyMouseButton = (button: number): HistoryDirection | null =>
    button === 3 ? 'back' : button === 4 ? 'forward' : null;
