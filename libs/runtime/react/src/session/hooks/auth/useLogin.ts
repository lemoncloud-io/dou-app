import { useQueryClient } from '@tanstack/react-query';
import { useCustomMutation } from '../../../reactUtils/hooks/useCustomMutation';
import type { SessionAccountView } from '@chatic/runtime-client';
import { loginMutation } from '@chatic/runtime/api/session';
import type { LoginVariables } from '@chatic/runtime/api/session';

export const useLogin = () => {
    const queryClient = useQueryClient();
    return useCustomMutation<SessionAccountView, string, LoginVariables>(loginMutation.mutationFn, {
        onSuccess: () => {
            for (const queryKey of loginMutation.invalidates) void queryClient.invalidateQueries({ queryKey });
        },
    });
};
