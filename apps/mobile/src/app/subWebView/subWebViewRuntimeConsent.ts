import type { SubWebViewRuntimePermission } from '@chatic/bridge-messages';

/** Where an allowed answer is kept: the permissions it covered, under the user, page and cloud. */
export interface SubWebViewConsentStore {
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
}

/** Asks the user; `true` to allow. */
export type AskSubWebViewConsent = (question: {
    host: string;
    permissions: readonly SubWebViewRuntimePermission[];
}) => Promise<boolean>;

/** Whose answer, for which page, in which cloud. */
export interface SubWebViewConsentKey {
    /** The user's id in that cloud. */
    userId: string;
    origin: string;
    cloudId: string;
    /**
     * The place, for a page that may send: its yes is kept per place, so allowing it to post in one
     * place says nothing about another. Absent for a page that only reads.
     */
    placeId?: string;
}

export interface SubWebViewRuntimeConsent {
    ensure(
        key: SubWebViewConsentKey,
        permissions: ReadonlySet<SubWebViewRuntimePermission>
    ): Promise<'allowed' | 'refused'>;
}

const storeKey = ({ userId, origin, cloudId, placeId }: SubWebViewConsentKey) =>
    `runtime\n${userId}\n${origin}\n${cloudId}${placeId === undefined ? '' : `\n${placeId}`}`;

const hostOf = (origin: string) => origin.replace(/^https:\/\//, '');

/**
 * The user's answer to "may this page read this cloud", before a page's first runtime request is
 * answered. Per user, page and cloud: the data is the cloud's, so allowing a page in one says nothing
 * about another. A page that may send messages is asked per place as well (`placeId`).
 *
 * - **Allowed** is kept, with the permissions it covered. A page whose manifest later asks for more is
 *   asked again.
 * - **Refused** is kept for this consent only — one per view — so a page that keeps asking does not
 *   put the question up again and again. The next view asks anew.
 * - **One question at a time.** Requests that arrive while it is up wait for the same answer.
 */
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
        const allowed = new Set(kept.split(','));
        return [...permissions].every(permission => allowed.has(permission));
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
                    store.set(id, [...permissions].sort().join(','));
                    return 'allowed' as const;
                });
            asking.set(id, question);
            return question;
        },
    };
};
