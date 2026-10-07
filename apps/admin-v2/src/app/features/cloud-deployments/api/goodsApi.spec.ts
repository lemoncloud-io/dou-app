/**
 * `api/cloud-deployments/goodsApi.spec.ts`
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface SentRequest {
    config: { method?: string; baseURL?: string };
    params?: Record<string, unknown>;
    body?: unknown;
}

const sent: SentRequest[] = [];
/** One entry per `execute()`: a reply, or an error to throw. */
const replies: ({ data: unknown } | { error: unknown })[] = [];

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        boot: {
            webTransport: {
                buildSignedRequest: (config: SentRequest['config']) => {
                    const request: SentRequest = { config };
                    sent.push(request);
                    const builder = {
                        setParams: (params: Record<string, unknown>) => {
                            request.params = params;
                            return builder;
                        },
                        setBody: (body: unknown) => {
                            request.body = body;
                            return builder;
                        },
                        execute: async () => {
                            const reply = replies.shift();
                            if (!reply) throw new Error('no reply queued');
                            if ('error' in reply) throw reply.error;
                            return reply;
                        },
                    };
                    return builder;
                },
            },
        },
    },
}));

import { SERVICE_CODES } from '../lib/cloudGroups';
import {
    buildProductListParams,
    fetchServiceProducts,
    postAutoDeploy,
    PRODUCT_PAGE_SIZE,
    type GoodsProduct,
} from './goodsApi';

const BASE = 'https://api.example.com/cgs-v1';

const rows = (count: number, code = SERVICE_CODES.backend): GoodsProduct[] =>
    Array.from({ length: count }, (_, index) => ({ id: `p${index}`, code, projectId: `c${index}` }));

beforeEach(() => {
    sent.length = 0;
    replies.length = 0;
});

describe('buildProductListParams', () => {
    it('asks for every owner, without catalog detail, one service per list', () => {
        expect(buildProductListParams('sockets', 2)).toEqual({
            view: 'admin',
            detail: 0,
            code: 'chatic-sockets-api',
            limit: 500,
            page: 2,
        });
    });
});

describe('fetchServiceProducts', () => {
    it('walks the pages of one service with signed list calls', async () => {
        replies.push({ data: { list: rows(PRODUCT_PAGE_SIZE) } }, { data: { list: rows(2) } });

        const result = await fetchServiceProducts(BASE, 'backend');

        expect(result).toMatchObject({ truncated: false });
        expect(result.list).toHaveLength(PRODUCT_PAGE_SIZE + 2);
        expect(sent.map(request => request.params?.page)).toEqual([0, 1]);
    });

    it('sends a signed list call for the one service', async () => {
        replies.push({ data: { list: rows(2) } });

        const result = await fetchServiceProducts(BASE, 'backend');

        expect(result.list).toHaveLength(2);
        expect(sent).toEqual([
            {
                config: { method: 'GET', baseURL: `${BASE}/products/0/list` },
                params: buildProductListParams('backend', 0),
            },
        ]);
    });

    it('rejects the list on the first page that holds another service', async () => {
        replies.push({ data: { list: [...rows(PRODUCT_PAGE_SIZE - 1), ...rows(1, SERVICE_CODES.socials)] } });

        await expect(fetchServiceProducts(BASE, 'backend')).rejects.toThrow(/not filtering by code/);
        expect(sent).toHaveLength(1);
    });

    it('turns a failed call into its response message, keeping the original as its cause', async () => {
        const original = { response: { status: 403, data: 'Forbidden' } };
        replies.push({ error: original });

        await expect(fetchServiceProducts(BASE, 'backend')).rejects.toMatchObject({
            message: 'Forbidden',
            cause: original,
        });
    });
});

describe('postAutoDeploy', () => {
    it('posts to the product with only the planned params and an empty JSON body', async () => {
        replies.push({ data: { id: 'p 1', status: 'busy' } });

        const product = await postAutoDeploy(BASE, {
            productId: 'p 1',
            projectId: 'c1',
            service: 'backend',
            force: true,
            branch: 'main',
            params: { force: 1, branch: 'main' },
        });

        expect(product.status).toBe('busy');
        expect(sent).toEqual([
            {
                config: { method: 'POST', baseURL: `${BASE}/products/p%201/auto-deploy` },
                params: { force: 1, branch: 'main' },
                body: {},
            },
        ]);
    });

    it('fails with the goods service message when it refuses', async () => {
        replies.push({ error: { response: { status: 400, data: { message: '400 INVALID STATE - busy' } } } });

        await expect(
            postAutoDeploy(BASE, { productId: 'p1', projectId: 'c1', service: 'backend', force: false, params: {} })
        ).rejects.toThrow('400 INVALID STATE - busy');
    });
});
