import { create } from 'zustand';

const STORAGE_KEY = 'dou.relayInvite.locallyCanceled.v1';

/** A corrupt/tampered value degrades to "nothing canceled" rather than throwing. */
const readStoredIds = (): string[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
    } catch {
        return [];
    }
};

const persistIds = (ids: readonly string[]): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
};

interface LocallyCanceledInvitesState {
    ids: Set<string>;
    markCanceled: (inviteId: string) => void;
}

/** Exported only so tests can reset in-memory state between cases; product code uses the hook. */
export const useLocallyCanceledInvitesStore = create<LocallyCanceledInvitesState>((set, get) => ({
    ids: new Set(readStoredIds()),
    markCanceled: inviteId => {
        if (get().ids.has(inviteId)) return;
        const next = new Set(get().ids);
        next.add(inviteId);
        set({ ids: next });
        persistIds([...next]);
    },
}));

/**
 * Local-only "canceled" stamp for sent invites (ADR-0033 — the backend has no `invite.cancel` API
 * yet, 백엔드 요청 목록 #1). Confirming cancel on the waiting screen does not call any server
 * mutation; it stamps the invite id here so this device stops showing it as pending/expired
 * (list rows, the waiting screen). The invite itself is untouched server-side — the recipient
 * can, in principle, still accept it. See `INVITE_CANCEL_API_SUPPORTED` in `../flags` and the
 * sender doc's "리스크와 미지수" for the known gap.
 */
export const useLocallyCanceledInvites = () => {
    const ids = useLocallyCanceledInvitesStore(state => state.ids);
    const markCanceled = useLocallyCanceledInvitesStore(state => state.markCanceled);

    const isCanceled = (inviteId: string): boolean => ids.has(inviteId);

    return { isCanceled, markCanceled };
};
