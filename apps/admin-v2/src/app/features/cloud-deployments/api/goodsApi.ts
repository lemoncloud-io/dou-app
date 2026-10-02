/**
 * `api/cloud-deployments/goodsApi.ts`
 * - The two goods service calls the deploy screen makes: the product list and auto-deploy.
 *
 * Signed app-local requests, like the log console's, rather than a gateway in the shared http
 * layers: this screen is the only caller of the goods service. What that costs is the shared layers'
 * credential retry and their network log — a lapsed credential surfaces here as a plain failure.
 *
 * @see goods service — `GET /products/0/list`, `POST /products/{id}/auto-deploy`.
 */
import { runtime } from '@chatic/app-runtime';

import { findForeignProducts, SERVICE_CODES, type CloudService } from '../lib/cloudGroups';
import { collectPages, type ListPage, type PagedList } from '../lib/listPaging';
import { asRequestError } from '../lib/requestError';

import type { DeployCall } from '../lib/deployPlan';

/** `progress$` as the goods service writes it while a deploy moves through its queue. */
export interface GoodsProgress {
    state?: string;
    status?: string;
    msg?: string;
    error?: string;
}

/** The slice of a goods product this screen reads. Kept local, like the other app-local calls. */
export interface GoodsProduct {
    id?: string;
    code?: string;
    projectId?: string;
    /** Copied onto the product when it was saved; `stereo` is the cloud's dev/prod mark. */
    project$?: { stereo?: string };
    ownerId?: string;
    owner$?: { name?: string };
    /** The goods workspace the product deploys into — the key a DoU cloud links back by. */
    workspaceId?: string;
    status?: string;
    progress$?: GoodsProgress;
}

export type ProductListResult = PagedList<GoodsProduct>;

export const PRODUCT_PAGE_SIZE = 500;

const GOODS_SERVICE = 'the goods service';

/**
 * Query params for one list page.
 *
 * `view: 'admin'` lists every owner's products and is refused (403) for a non-admin caller.
 * `detail: 0` because the default attaches each product's catalog and roughly quadruples the reply.
 */
export const buildProductListParams = (service: CloudService, page: number): Record<string, string | number> => ({
    view: 'admin',
    detail: 0,
    code: SERVICE_CODES[service],
    limit: PRODUCT_PAGE_SIZE,
    page,
});

/**
 * One service's products, every page.
 *
 * The `code` check runs on each page, so an unfiltered goods service is caught on the first reply
 * instead of after walking its whole catalog.
 */
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

/**
 * Queues one product's deploy. 2xx is success: the reply is the product, now `busy`. A queued deploy
 * is not a finished one — the outcome lands on the product's `status` and `progress$` later.
 *
 * The empty body is for the signature, not the goods service, which reads none. The signer signs a
 * POST without a body as if its body were `{}`, while the request itself goes out empty; the gateway
 * then rejects the mismatched signature, and since that 403 carries no CORS headers it reaches the
 * browser as a bare network error. Sending `{}` makes what is signed and what is sent agree.
 */
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
