import { useCustomMutation } from '@chatic/shared';
import type { LoginUserBody, UserTokenView } from '@lemoncloud/chatic-backend-api';
import { login } from '../../api';

export const useIssueToken = () => {
    const mutation = useCustomMutation<UserTokenView, string, LoginUserBody & { email?: boolean }>(
        ({ email, ...body }) => login(body, email)
    );

    return {
        ...mutation,
        issuingLoginId: mutation.isPending ? mutation.variables?.uid : null,
    };
};
