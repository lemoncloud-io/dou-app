import { useQuery } from '@tanstack/react-query';

import { createQueryKeys, useCustomMutation } from '@lemon/shared';
import { toast } from '@lemon/ui-kit/hooks/use-toast';

import { createBoardType, deleteBoardType, fetchBoardTypeById, fetchBoardTypes, updateBoardType } from '../api';

import type { UpdateBoardTypeDTO } from '../types';
import type { PaginationType, Params } from '@lemon/shared';
import type { TypeBody, TypeView } from '@lemoncloud/lemon-boards-api';

export const boardTypesKeys = createQueryKeys('boardTypes');

export const useBoardTypes = (params: Params) =>
    useQuery<PaginationType<TypeView[]>>({
        queryKey: boardTypesKeys.list(params ?? {}),
        queryFn: async () => {
            const result = await fetchBoardTypes(params);
            return { ...result, data: result.list || [] } as PaginationType<TypeView[]>;
        },
        refetchOnWindowFocus: false,
    });

export const useBoardType = (billingId: string) =>
    useQuery<TypeView>({
        queryKey: boardTypesKeys.detail(billingId),
        queryFn: () => fetchBoardTypeById(billingId),
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        enabled: !!billingId,
    });

export const useCreateBoardType = () => {
    return useCustomMutation((data: TypeBody) => createBoardType(data), {
        onError: error => {
            toast({
                description: error instanceof Error ? error.message : 'An unknown error occurred',
                variant: 'destructive',
            });
        },
    });
};

export const useUpdateBoardType = () => {
    return useCustomMutation((data: UpdateBoardTypeDTO) => updateBoardType(data), {
        onError: error => {
            toast({
                description: error instanceof Error ? error.message : 'An unknown error occurred',
                variant: 'destructive',
            });
        },
    });
};

export const useDeleteBoardType = () => {
    return useCustomMutation((id: string) => deleteBoardType(id), {
        onError: error => {
            toast({
                description: error instanceof Error ? error.message : 'An unknown error occurred',
                variant: 'destructive',
            });
        },
    });
};
