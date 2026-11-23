import { useMutation } from '@tanstack/react-query';

import type { UseMutationOptions } from '@tanstack/react-query';

export interface MutationConfig<TData, TError, TVariables>
    extends Omit<UseMutationOptions<TData, TError, TVariables>, 'mutationFn'> {}

export const useCustomMutation = <TData, TError, TVariables>(
    mutationFn: (variables: TVariables) => Promise<TData>,
    config?: MutationConfig<TData, TError, TVariables>
) => {
    return useMutation({
        mutationFn,
        ...config,
    });
};
