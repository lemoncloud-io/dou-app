import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

/**
 * A login's answer as a screen may see it: the account's fields, without the `Token` that signs as
 * it. A login command hands this back, never the token view — on the phone the session can belong to
 * another process, and the page then must not hold a credential. The token stays with the session.
 */
export type SessionAccountView = Omit<UserTokenView, 'Token'>;

/** `view` without its `Token`. */
export const withoutToken = (view: UserTokenView): SessionAccountView => {
    const { Token: _token, ...account } = view;
    return account;
};
