import { useMutation } from '@tanstack/react-query';

import type { UseMutationOptions } from '@tanstack/react-query';

/**
 * A custom hook that wraps useMutation, providing type safety and consistent error handling.
 *
 * @template TData - The API response data type
 * @template TError - The API error type
 * @template TVariables - The type of the variables passed to the mutation function
 *
 * @param mutationFn - The API call function
 * @param config - The mutation configuration (onSuccess, onError, etc.)
 */
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
