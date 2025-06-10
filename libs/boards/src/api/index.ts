import { webCore } from '@lemon/web-core';

import type { BoardFormData, UpdateBoardDTO } from '../types';
import type { ListResult, Params } from '@lemon/shared';
import type { BoardView } from '@lemoncloud/lemon-boards-api';

const BOARD_ENDPOINT = import.meta.env.VITE_BOARD_ENDPOINT.toLowerCase();

export const fetchBoards = async (params: Params): Promise<ListResult<BoardView>> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${BOARD_ENDPOINT}/boards`,
        })
        .setParams({ ...params })
        .execute<ListResult<BoardView>>();

    return { ...data };
};

export const fetchBoardById = async (boardId?: string): Promise<BoardView> => {
    if (!boardId) {
        throw new Error('fetchBoardById: @boardId is required');
    }

    const { data } = await webCore
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${BOARD_ENDPOINT}/boards/${boardId}`,
        })
        .execute<BoardView>();

    return { ...data };
};

export const createBoard = async (createBody: BoardFormData): Promise<BoardView> => {
    const response = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${BOARD_ENDPOINT}/boards/0`,
        })
        .setBody({ ...createBody })
        .execute<BoardView>();

    return response.data;
};

export const updateBoard = async (updateBody: UpdateBoardDTO): Promise<BoardView> => {
    const { boardId, ...data } = updateBody;

    if (!boardId) {
        throw new Error('updateBoard: @boardId is required');
    }

    const response = await webCore
        .buildSignedRequest({
            method: 'PUT',
            baseURL: `${BOARD_ENDPOINT}/boards/${boardId}`,
        })
        .setBody({ ...data })
        .execute<BoardView>();

    return response.data;
};

export const deleteBoard = async (boardId: string): Promise<BoardView> => {
    if (!boardId) {
        throw new Error('deleteBoard: @boardId is required');
    }

    const { data } = await webCore
        .buildSignedRequest({
            method: 'DELETE',
            baseURL: `${BOARD_ENDPOINT}/boards/${boardId}`,
        })
        .setBody({})
        .execute<BoardView>();

    return data;
};
