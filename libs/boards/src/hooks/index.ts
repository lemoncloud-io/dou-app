import { useQuery } from '@tanstack/react-query';

import { createQueryKeys, useCustomMutation } from '@lemon/shared';
import { toast } from '@lemon/ui-kit/hooks/use-toast';

import { createBoard, deleteBoard, fetchBoardById, fetchBoards, updateBoard } from '../api';

import type { BoardFormData, UpdateBoardDTO } from '../types';
import type { PaginationType, Params } from '@lemon/shared';
import type { BoardView } from '@lemoncloud/lemon-boards-api';

export const boardsKeys = createQueryKeys('boards');

export const useBoards = (params: Params) =>
    useQuery<PaginationType<BoardView[]>>({
        queryKey: boardsKeys.list(params ?? {}),
        queryFn: async () => {
            const result = await fetchBoards(params);
            return { ...result, data: result.list || [] } as PaginationType<BoardView[]>;
        },
        refetchOnWindowFocus: false,
    });

export const useBoard = (boardId: string) =>
    useQuery<BoardView>({
        queryKey: boardsKeys.detail(boardId),
        queryFn: () => fetchBoardById(boardId),
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        enabled: !!boardId,
    });

export const useCreateBoard = () => {
    return useCustomMutation((data: BoardFormData) => createBoard(data), {
        onError: error => {
            toast({
                description: error instanceof Error ? error.message : 'An unknown error occurred',
                variant: 'destructive',
            });
        },
    });
};

export const useUpdateBoard = () => {
    return useCustomMutation((data: UpdateBoardDTO) => updateBoard(data), {
        onError: error => {
            toast({
                description: error instanceof Error ? error.message : 'An unknown error occurred',
                variant: 'destructive',
            });
        },
    });
};

export const useDeleteBoard = () => {
    return useCustomMutation((id: string) => deleteBoard(id), {
        onError: error => {
            toast({
                description: error instanceof Error ? error.message : 'An unknown error occurred',
                variant: 'destructive',
            });
        },
    });
};
