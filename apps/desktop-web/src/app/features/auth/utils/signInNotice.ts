import { plainStore } from '../../../storage';

export interface SignInNoticeRecord {
    provider: string;
    isNew: boolean;
}

const SIGN_IN_NOTICE_KEY = 'chatic-signin-notice';

export const NEW_ACCOUNT_CLOCK_SLACK_MS = 60 * 1000;

export const isAccountMadeSince = (account: unknown, startedAt: number): boolean => {
    const createdAt = (account as { createdAt?: unknown } | null)?.createdAt;
    return typeof createdAt === 'number' && createdAt >= startedAt - NEW_ACCOUNT_CLOCK_SLACK_MS;
};

export const saveSignInNotice = (notice: SignInNoticeRecord): void => {
    plainStore.set(SIGN_IN_NOTICE_KEY, JSON.stringify(notice));
};

export const takeSignInNotice = (): SignInNoticeRecord | null => {
    const raw = plainStore.get(SIGN_IN_NOTICE_KEY);
    plainStore.remove(SIGN_IN_NOTICE_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<SignInNoticeRecord> | null;
        if (typeof parsed?.provider !== 'string' || typeof parsed.isNew !== 'boolean') return null;
        return { provider: parsed.provider, isNew: parsed.isNew };
    } catch {
        return null;
    }
};
