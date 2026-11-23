import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

export type SessionAccountView = Omit<UserTokenView, 'Token'>;

export const withoutToken = (view: UserTokenView): SessionAccountView => {
    const { Token: _token, ...account } = view;
    return account;
};
