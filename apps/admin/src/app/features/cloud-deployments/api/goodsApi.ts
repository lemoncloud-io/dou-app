import { runtime } from '@chatic/runtime-react';

import { findForeignProducts, SERVICE_CODES, type CloudService } from '../lib/cloudGroups';
import { collectPages, type ListPage, type PagedList } from '../lib/listPaging';
import { asRequestError } from '../lib/requestError';

import type { DeployCall } from '../lib/deployPlan';

export interface GoodsProgress {
    state?: string;
    status?: string;
    msg?: string;
    error?: string;
}

export interface GoodsProduct {
    id?: string;
    code?: string;
    projectId?: string;
    project$?: { stereo?: string };
    ownerId?: string;
    owner$?: { name?: string };
    workspaceId?: string;
    status?: string;
    progress$?: GoodsProgress;
    deployedAt?: number;
    deployingAt?: number;
}

export type ProductListResult = PagedList<GoodsProduct>;

export const PRODUCT_PAGE_SIZE = 500;

const GOODS_SERVICE = 'the goods service';

export const buildProductListParams = (service: CloudService, page: number): Record<string, string | number> => ({
    view: 'admin',
    detail: 0,
    code: SERVICE_CODES[service],
    limit: PRODUCT_PAGE_SIZE,
    page,
});

export const fetchServiceProducts = async (base: string, service: CloudService): Promise<ProductListResult> =>
    collectPages(async page => {
        let response: ListPage<GoodsProduct>;
        try {
            const { data } = await runtime.boot.webTransport
                .buildSignedRequest({ method: 'GET', baseURL: `${base}/products/0/list` })
                .setParams(buildProductListParams(service, page))
                .execute<ListPage<GoodsProduct>>();
            response = data ?? {};
        } catch (error) {
            throw asRequestError(error, GOODS_SERVICE);
        }

        const foreign = findForeignProducts(service, response.list ?? []);
        if (foreign.length > 0) {
            throw new Error(
                `The ${SERVICE_CODES[service]} list came back with ${foreign.length} product(s) of other services, so this goods service is not filtering by code yet. The list is not used.`
            );
        }
        return response;
    }, PRODUCT_PAGE_SIZE);

export const postAutoDeploy = async (base: string, call: DeployCall): Promise<GoodsProduct> => {
    try {
        const { data } = await runtime.boot.webTransport
            .buildSignedRequest({
                method: 'POST',
                baseURL: `${base}/products/${encodeURIComponent(call.productId)}/auto-deploy`,
            })
            .setParams(call.params)
            .setBody({})
            .execute<GoodsProduct>();
        return data ?? {};
    } catch (error) {
        throw asRequestError(error, GOODS_SERVICE);
    }
};
