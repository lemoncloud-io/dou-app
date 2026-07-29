import { useMutation } from '@tanstack/react-query';

import { useRuntimeGateways } from '@chatic/app-runtime';
import type { AttachSocialView } from '@lemoncloud/chatic-backend-api';

/**
 * Native token bundle for `auth.attach-social`. Which field carries the credential depends on the
 * provider (Apple uses `identityToken`), so the shape stays open and only `provider` is required.
 */
export type AttachSocialTokens = Record<string, unknown> & { provider: string };

/**
 * Links one more social account to a session that is ALREADY a main user.
 *
 * This is not a login: the session does not change and no token comes back, so nothing needs to be
 * pushed into the sockets afterwards. A device user cannot use this — signing in with a social
 * account for the first time still goes through the existing REST OAuth path.
 *
 * 409 means the account already belongs to a different user; 403 means the session is not a main
 * user. Branch with `getSocketErrorCode`.
 */
export const useAttachSocial = () => {
    const { auth } = useRuntimeGateways();

    const mutation = useMutation({
        mutationFn: (tokens: AttachSocialTokens) => auth.attachSocial<AttachSocialView>(tokens),
    });

    return {
        attach: (tokens: AttachSocialTokens) => mutation.mutateAsync(tokens),
        isPending: mutation.isPending,
    };
};
