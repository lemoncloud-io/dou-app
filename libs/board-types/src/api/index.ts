import { webCore } from '@lemon/web-core';

import type { UpdateBoardTypeDTO } from '../types';
import type { ListResult, Params } from '@lemon/shared';
import type { TypeBody, TypeView } from '@lemoncloud/lemon-boards-api';

const BOARD_ENDPOINT = import.meta.env.VITE_BOARD_ENDPOINT.toLowerCase();

export const fetchBoardTypes = async (params: Params): Promise<ListResult<TypeView>> => {
    const { data } = await webCore
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${BOARD_ENDPOINT}/types`,
        })
        .setParams({ ...params })
        .execute<ListResult<TypeView>>();

    return { ...data };
};

export const fetchBoardTypeById = async (boardTypeId?: string): Promise<TypeView> => {
    if (!boardTypeId) {
        throw new Error('fetchBoardTypeById: @boardTypeId is required');
    }

    const { data } = await webCore
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${BOARD_ENDPOINT}/types/${boardTypeId}`,
        })
        .execute<TypeView>();

    return { ...data };
};

export const createBoardType = async (createBody: TypeBody): Promise<TypeView> => {
    const response = await webCore
        .buildSignedRequest({
            method: 'POST',
            baseURL: `${BOARD_ENDPOINT}/types/0`,
        })
        .setBody({ ...createBody })
        .execute<TypeView>();

    return response.data;
};

export const updateBoardType = async (updateBody: UpdateBoardTypeDTO): Promise<TypeView> => {
    const { boardTypeId, ...data } = updateBody;

    if (!boardTypeId) {
        throw new Error('updateBoardType: @boardTypeId is required');
    }

    const response = await webCore
        .buildSignedRequest({
            method: 'PUT',
            baseURL: `${BOARD_ENDPOINT}/types/${boardTypeId}`,
        })
        .setBody({ ...data })
        .execute<TypeView>();

    return response.data;
};

export const deleteBoardType = async (boardTypeId: string): Promise<TypeView> => {
    if (!boardTypeId) {
        throw new Error('deleteBoardType: @boardTypeId is required');
    }

    const { data } = await webCore
        .buildSignedRequest({
            method: 'DELETE',
            baseURL: `${BOARD_ENDPOINT}/types/${boardTypeId}`,
        })
        .setBody({})
        .execute<TypeView>();

    return data;
};
