import { useQueryClient } from '@tanstack/react-query';
import { useCustomMutation } from '@chatic/shared';
import type { SessionAccountView } from '@chatic/runtime-client';
import { sessionCommands } from '@chatic/runtime-client';
import { cloudsKeys } from '../../../data/hooks/queryKeys';
import type { LoginUserBody } from '@lemoncloud/chatic-backend-api';

export const useLogin = () => {
    const queryClient = useQueryClient();
    return useCustomMutation<SessionAccountView, string, LoginUserBody & { email?: boolean }>(
        ({ email, ...body }) => sessionCommands().loginUser(body, { email }),
        {
            onSuccess: () => {
                void queryClient.invalidateQueries({ queryKey: cloudsKeys.all });
            },
        }
    );
};
