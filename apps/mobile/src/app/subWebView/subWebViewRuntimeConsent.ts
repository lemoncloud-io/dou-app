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
 * The wording a yes was given under, per permission whose question once said less than it does now.
 * A kept yes covers such a permission only if it was given under at least this revision; one given
 * earlier is asked again, once. A permission not listed has said the same since it was first asked.
 *
 * - `user` 2: the question says that reading members hands over what their accounts carry. Before,
 *   it named "members and profiles" only.
 * - `cloud` 2: the question says that an owned cloud comes with its owner, linked account,
 *   subscription and server. Before, it named "the cloud" only.
 */
export const SUB_WEB_VIEW_CONSENT_REVISION: Partial<Record<SubWebViewRuntimePermission, number>> = {
    user: 2,
    cloud: 2,
};

/** The revision every new yes is kept under: the highest a permission needs. */
const CURRENT_REVISION = Math.max(1, ...Object.values(SUB_WEB_VIEW_CONSENT_REVISION).map(Number));

/**
 * A kept yes, as `channel,user` (before revisions were kept, read as revision 1) or
 * `channel,user;2`.
 */
const readKept = (kept: string): { allowed: ReadonlySet<string>; revision: number } => {
    const [names, revision] = kept.split(';');
    const parsed = Number(revision);
    return {
        allowed: new Set(names.split(',')),
        revision: Number.isInteger(parsed) && parsed > 0 ? parsed : 1,
    };
};

/**
 * The user's answer to "may this page read this cloud", before a page's first runtime request is
 * answered. Per user, page and cloud: the data is the cloud's, so allowing a page in one says nothing
 * about another. A page that may send messages is asked per place as well (`placeId`).
 *
 * - **Allowed** is kept, with the permissions it covered and the wording it was given under. A page
 *   whose manifest later asks for more is asked again, and so is a yes given before the question said
 *   what it says now about one of its permissions (`SUB_WEB_VIEW_CONSENT_REVISION`).
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
