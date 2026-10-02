/**
 * `api/cloud-deployments/douCloudsApi.spec.ts`
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface SentRequest {
    config: { method?: string; baseURL?: string };
    params?: Record<string, unknown>;
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

import { buildDouCloudListParams, DOU_CLOUD_PAGE_SIZE, fetchDouClouds } from './douCloudsApi';

const BASE = 'https://api.example.com/dou-v1';

const clouds = (count: number, offset = 0) =>
    Array.from({ length: count }, (_, index) => ({ id: `${offset + index}`, workspaceId: `w${offset + index}` }));

beforeEach(() => {
    sent.length = 0;
    replies.length = 0;
});

describe('buildDouCloudListParams', () => {
    it("asks for every user's clouds, expired ones included", () => {
        expect(buildDouCloudListParams(2)).toEqual({ view: 'admin', valid: 0, limit: DOU_CLOUD_PAGE_SIZE, page: 2 });
    });
});

describe('fetchDouClouds', () => {
    it('sends a signed list call to the relay', async () => {
        replies.push({ data: { list: clouds(2), total: 2 } });

        expect(await fetchDouClouds(BASE)).toHaveLength(2);
        expect(sent).toEqual([
            {
                config: { method: 'GET', baseURL: `${BASE}/clouds/0/list` },
                params: buildDouCloudListParams(0),
            },
        ]);
    });

    it('walks the pages until the total is reached', async () => {
        replies.push({ data: { list: clouds(DOU_CLOUD_PAGE_SIZE), total: DOU_CLOUD_PAGE_SIZE + 3 } });
        replies.push({ data: { list: clouds(3, DOU_CLOUD_PAGE_SIZE), total: DOU_CLOUD_PAGE_SIZE + 3 } });

        expect(await fetchDouClouds(BASE)).toHaveLength(DOU_CLOUD_PAGE_SIZE + 3);
        expect(sent.map(request => request.params?.page)).toEqual([0, 1]);
    });

    it('names the relay when the call gets no response', async () => {
        replies.push({ error: new Error('Network Error') });

        await expect(fetchDouClouds(BASE)).rejects.toThrow(/^No response from the relay \(Network Error\)/);
    });
});
