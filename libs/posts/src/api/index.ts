import { webCore } from '@lemon/web-core';

import type { CreatePostDTO, UpdatePostDTO } from '../types';
import type { ListResult, Params } from '@lemon/shared';
import type { PostView } from '@lemoncloud/lemon-boards-api';

const BOARD_ENDPOINT = import.meta.env.VITE_BOARD_ENDPOINT.toLowerCase();

export const fetchPostsByBoardId = async (params: Params): Promise<ListResult<PostView>> => {
    if (!params['boardId']) {
        throw new Error('fetchPostsByBoardId: .boardId is required');
    }
    const { data } = await webCore
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${BOARD_ENDPOINT}/posts`,
        })
        .setParams({ ...params })
        .execute<ListResult<PostView>>();

    return { ...data };
};

export const fetchPostById = async (postId?: string): Promise<PostView> => {
    if (!postId) {
        throw new Error('fetchPostById: @postId is required');
    }

    const { data } = await webCore
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${BOARD_ENDPOINT}/posts/${postId}`,
        })
        .execute<PostView>();

    return { ...data };
};

export const createPost = async (createBody: CreatePostDTO): Promise<PostView> => {
    if (!createBody.boardId) {
        throw new Error('createPost: .boardId is required');
    }

    const response = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${BOARD_ENDPOINT}/posts/0`,
        })
        .setBody({ ...createBody })
        .execute<PostView>();

    return response.data;
};

export const updatePost = async (updateBody: UpdatePostDTO): Promise<PostView> => {
    const { postId, ...data } = updateBody;

    if (!postId) {
        throw new Error('updatePost: @postId is required');
    }

    const response = await webCore
        .buildSignedRequest({
            method: 'PUT',
            baseURL: `${BOARD_ENDPOINT}/posts/${postId}`,
        })
        .setBody({ ...data })
        .execute<PostView>();

    return response.data;
};

export const deletePost = async (postId: string): Promise<PostView> => {
    if (!postId) {
        throw new Error('deletePost: @postId is required');
    }

    const { data } = await webCore
        .buildSignedRequest({
            method: 'DELETE',
            baseURL: `${BOARD_ENDPOINT}/posts/${postId}`,
        })
        .setBody({})
        .execute<PostView>();

    return data;
};

export const fetchCommentsByPostId = async (params: Params): Promise<ListResult<PostView>> => {
    const { postId, ...data } = params;
    if (!postId) {
        throw new Error('fetchCommentsByPostId: @postId is required');
    }

    const response = await webCore
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${BOARD_ENDPOINT}/posts/${postId}/comments`,
        })
        .setParams({ ...data })
        .execute<ListResult<PostView>>();

    return response.data;
};
