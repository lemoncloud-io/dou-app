import { runtime } from '@chatic/runtime';

import { collectPages, type ListPage } from '../lib/listPaging';
import { asRequestError } from '../lib/requestError';

export interface DouCloud {
    id?: string;
    name?: string;
    status?: string;
    ownerId?: string;
    owner$?: { id?: string; name?: string };
    accountNo?: string;
    workspaceId?: string;
}

export const DOU_CLOUD_PAGE_SIZE = 100;

export const buildDouCloudListParams = (page: number): Record<string, string | number> => ({
    view: 'admin',
    valid: 0,
    limit: DOU_CLOUD_PAGE_SIZE,
    page,
});

export const fetchDouClouds = async (base: string): Promise<DouCloud[]> => {
    const { list } = await collectPages(async page => {
        try {
            const { data } = await runtime.boot.webTransport
                .buildSignedRequest({ method: 'GET', baseURL: `${base}/clouds/0/list` })
                .setParams(buildDouCloudListParams(page))
                .execute<ListPage<DouCloud>>();
            return data ?? {};
        } catch (error) {
            throw asRequestError(error, 'the relay');
        }
    }, DOU_CLOUD_PAGE_SIZE);
    return list;
};
