import { useQuery } from '@tanstack/react-query';

import { createQueryKeys, useCustomMutation } from '@lemon/shared';
import { toast } from '@lemon/ui-kit/hooks/use-toast';

import { createPost, deletePost, fetchCommentsByPostId, fetchPostById, fetchPostsByBoardId, updatePost } from '../api';

import type { CreatePostDTO, UpdatePostDTO } from '../types';
import type { PaginationType, Params } from '@lemon/shared';
import type { PostView } from '@lemoncloud/lemon-boards-api';

export const postKeys = createQueryKeys('posts');

export const usePosts = (params: Params) =>
    useQuery<PaginationType<PostView[]>>({
        queryKey: postKeys.list(params ?? {}),
        queryFn: async () => {
            const result = await fetchPostsByBoardId(params);
            return { ...result, data: result.list || [] } as PaginationType<PostView[]>;
        },
        refetchOnWindowFocus: false,
    });

export const usePost = (postId: string) =>
    useQuery<PostView>({
        queryKey: postKeys.detail(postId),
        queryFn: () => fetchPostById(postId),
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        enabled: !!postId,
    });

export const useComments = (params: Params) =>
    useQuery<PaginationType<PostView[]>>({
        queryKey: postKeys.list(params ?? {}),
        queryFn: async () => {
            const result = await fetchCommentsByPostId(params);
            return { ...result, data: result.list || [] } as PaginationType<PostView[]>;
        },
        refetchOnWindowFocus: false,
    });

export const useCreatePost = () => {
    return useCustomMutation((data: CreatePostDTO) => createPost(data), {
        onError: error => {
            toast({
                description: error instanceof Error ? error.message : 'An unknown error occurred',
                variant: 'destructive',
            });
        },
    });
};

export const useUpdatePost = () => {
    return useCustomMutation((data: UpdatePostDTO) => updatePost(data), {
        onError: error => {
            toast({
                description: error instanceof Error ? error.message : 'An unknown error occurred',
                variant: 'destructive',
            });
        },
    });
};

export const useDeletePost = () => {
    return useCustomMutation((id: string) => deletePost(id), {
        onError: error => {
            toast({
                description: error instanceof Error ? error.message : 'An unknown error occurred',
                variant: 'destructive',
            });
        },
    });
};
