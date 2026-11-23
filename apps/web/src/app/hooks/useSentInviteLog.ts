import { create } from 'zustand';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { deviceStore } from '../storage';

interface SentInviteEntry {
    inviteId: string;
    name: string;
}

type SentInviteLogMap = Record<string, SentInviteEntry>;

const STORAGE_KEY = 'dou.relayInvite.sentLog.v2';

const readStoredLog = (): SentInviteLogMap => {
    try {
        const raw = deviceStore.get(STORAGE_KEY);
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
    deviceStore.set(STORAGE_KEY, JSON.stringify(log));
};

interface SentInviteLogState {
    log: SentInviteLogMap;
    record: (invite: MyInviteView, input: { phone: string; name: string }) => void;
}

export const useSentInviteLogStore = create<SentInviteLogState>((set, get) => ({
    log: readStoredLog(),
    record: (invite, input) => {
        if (!invite.id) return;
        const next = { ...get().log, [input.phone]: { inviteId: invite.id, name: input.name } };
        set({ log: next });
        persistLog(next);
    },
}));

export const useSentInviteLog = () => {
    const log = useSentInviteLogStore(state => state.log);
    const record = useSentInviteLogStore(state => state.record);

    const findByPhone = (phone: string): SentInviteEntry | undefined => log[phone];

    const findByInviteId = (inviteId: string): (SentInviteEntry & { phone: string }) | undefined => {
        const match = Object.entries(log).find(([, entry]) => entry.inviteId === inviteId);
        return match ? { phone: match[0], inviteId: match[1].inviteId, name: match[1].name } : undefined;
    };

    return { record, findByPhone, findByInviteId };
};
