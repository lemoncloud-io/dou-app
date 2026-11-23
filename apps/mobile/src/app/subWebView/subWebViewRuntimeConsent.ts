import type { SubWebViewRuntimePermission } from '@chatic/bridge-messages';

export interface SubWebViewConsentStore {
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
}

export type AskSubWebViewConsent = (question: {
    host: string;
    permissions: readonly SubWebViewRuntimePermission[];
}) => Promise<boolean>;

export interface SubWebViewConsentKey {
    userId: string;
    origin: string;
    cloudId: string;
    placeId: string;
}

export interface SubWebViewRuntimeConsent {
    ensure(
        key: SubWebViewConsentKey,
        permissions: ReadonlySet<SubWebViewRuntimePermission>
    ): Promise<'allowed' | 'refused'>;
}

const storeKey = ({ userId, origin, cloudId, placeId }: SubWebViewConsentKey) =>
    `runtime\n${userId}\n${origin}\n${cloudId}\n${placeId}`;

const hostOf = (origin: string) => origin.replace(/^https:\/\//, '');

export const SUB_WEB_VIEW_CONSENT_REVISION: Partial<Record<SubWebViewRuntimePermission, number>> = {
    user: 2,
    cloud: 2,
};

const CURRENT_REVISION = Math.max(1, ...Object.values(SUB_WEB_VIEW_CONSENT_REVISION).map(Number));

const readKept = (kept: string): { allowed: ReadonlySet<string>; revision: number } => {
    const [names, revision] = kept.split(';');
    const parsed = Number(revision);
    return {
        allowed: new Set(names.split(',')),
        revision: Number.isInteger(parsed) && parsed > 0 ? parsed : 1,
    };
};

export const createSubWebViewRuntimeConsent = ({
    store,
    ask,
}: {
    store: SubWebViewConsentStore;
    ask: AskSubWebViewConsent;
}): SubWebViewRuntimeConsent => {
    const refused = new Set<string>();
    const asking = new Map<string, Promise<'allowed' | 'refused'>>();

    const covered = (key: string, permissions: ReadonlySet<SubWebViewRuntimePermission>): boolean => {
        const kept = store.getString(key);
        if (kept === undefined) return false;
        const { allowed, revision } = readKept(kept);
        return [...permissions].every(
            permission => allowed.has(permission) && revision >= (SUB_WEB_VIEW_CONSENT_REVISION[permission] ?? 1)
        );
    };

    return {
        ensure: (key, permissions) => {
            const id = storeKey(key);
            if (covered(id, permissions)) return Promise.resolve('allowed');
            if (refused.has(id)) return Promise.resolve('refused');
            const pending = asking.get(id);
            if (pending) return pending;

            const question = ask({ host: hostOf(key.origin), permissions: [...permissions].sort() })
                .catch(() => false)
                .then(allow => {
                    asking.delete(id);
                    if (!allow) {
                        refused.add(id);
                        return 'refused' as const;
                    }
                    store.set(id, `${[...permissions].sort().join(',')};${CURRENT_REVISION}`);
                    return 'allowed' as const;
                });
            asking.set(id, question);
            return question;
        },
    };
};
