import { create } from 'zustand';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

/** One remembered issuance: which invite id went to which recipient name. */
interface SentInviteEntry {
    inviteId: string;
    name: string;
}

/** Keyed by the recipient's number in E.164 (`+821012345678`). */
type SentInviteLogMap = Record<string, SentInviteEntry>;

const STORAGE_KEY = 'dou.relayInvite.sentLog.v2';
/**
 * `.v1` was keyed by local Korean digits, which collide across countries once invites can go
 * anywhere. There is no `persist` middleware here and no `migrate` hook, so bumping the key IS the
 * migration: entries are a local convenience cache (ADR-0044 §6) and simply lapse. The old key is
 * cleared on the first read so the dead data does not sit in storage forever.
 */
const LEGACY_STORAGE_KEY = 'dou.relayInvite.sentLog.v1';

/** A corrupt/tampered value degrades to an empty log rather than throwing. */
const readStoredLog = (): SentInviteLogMap => {
    if (typeof window === 'undefined') return {};
    try {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

        const result: SentInviteLogMap = {};
        for (const [phone, entry] of Object.entries(parsed as Record<string, unknown>)) {
            const candidate = entry as Partial<SentInviteEntry> | null;
            if (candidate && typeof candidate.inviteId === 'string' && typeof candidate.name === 'string') {
                result[phone] = { inviteId: candidate.inviteId, name: candidate.name };
            }
        }
        return result;
    } catch {
        return {};
    }
};

const persistLog = (log: SentInviteLogMap): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
};

interface SentInviteLogState {
    log: SentInviteLogMap;
    record: (invite: MyInviteView, input: { phone: string; name: string }) => void;
}

/** Exported only so tests can reset in-memory state between cases; product code uses the hook. */
export const useSentInviteLogStore = create<SentInviteLogState>((set, get) => ({
    log: readStoredLog(),
    record: (invite, input) => {
        // No id means no invite actually happened — nothing to remember.
        if (!invite.id) return;
        const next = { ...get().log, [input.phone]: { inviteId: invite.id, name: input.name } };
        set({ log: next });
        persistLog(next);
    },
}));

/**
 * Local memory of relay invites this device has issued, keyed by the recipient's E.164 number.
 *
 * Exists because the server view never carries the phone number in full — `MyInviteView` only
 * exposes a masked `last4` (ADR-0033) — so detecting "you already invited this number" and
 * labeling the waiting screen both need a client-side record of what was actually typed.
 * Persisted to localStorage rather than repositories-v2: this is a small phone->invite lookup
 * with no offline/sync requirement, not a synced domain collection.
 *
 * Callers must key `record`/`findByPhone` with the same phone representation: E.164, via
 * `toE164`. Local forms would collide once invites can go to any country — `09012345678` is a
 * Japanese number and a Korean-shaped string at once — and the key is also what `findByInviteId`
 * hands back, so it has to carry the country too (ADR-0044 §6).
 */
export const useSentInviteLog = () => {
    const log = useSentInviteLogStore(state => state.log);
    const record = useSentInviteLogStore(state => state.record);

    const findByPhone = (phone: string): SentInviteEntry | undefined => log[phone];

    /**
     * Reverse lookup for the waiting screen's "초대 다시 하기" (reissue): it only has the
     * invite id (the route param — never the code, never the phone), so it needs the phone back
     * to call `createInvite` again. Added after the roadmap's original two-method contract (see
     * relay-dm-invite-parallel-roadmap.md Track B interface contract) — additive only, no
     * existing call site changes shape.
     */
    const findByInviteId = (inviteId: string): (SentInviteEntry & { phone: string }) | undefined => {
        const match = Object.entries(log).find(([, entry]) => entry.inviteId === inviteId);
        return match ? { phone: match[0], inviteId: match[1].inviteId, name: match[1].name } : undefined;
    };

    return { record, findByPhone, findByInviteId };
};
