/**
 * `api/cloud-deployments/douCloudsApi.ts`
 * - The relay's own record of every subscription cloud, read to say whose cloud a goods project is.
 *
 * The goods service only knows its own owner ids, which are not DoU user ids, and on some products
 * the owner it records is a service identity rather than a person (measured: every such product links
 * to a DoU cloud). The relay knows the actual subscriber, so the screen reads its cloud list and joins
 * it to the goods projects by `workspaceId`, which both sides carry.
 *
 * `view: 'admin'` without an owner lists every user's clouds. That endpoint enforces no admin role on
 * the server (see the memberships console's known gap); the admin login in front of this screen is
 * the gate. Only the fields below are read — not the subscription email.
 *
 * @see chatic-backend-api — `GET /clouds/0/list`, `CloudView`.
 */
import { runtime } from '@chatic/app-runtime';

import { collectPages, type ListPage } from '../lib/listPaging';
import { asRequestError } from '../lib/requestError';

/** The slice of the relay's `CloudView` this screen reads. */
export interface DouCloud {
    id?: string;
    /** The cloud's name in DoU. */
    name?: string;
    /** `active`, `suspended`, `expired`, … — the subscription's state, not the deploy's. */
    status?: string;
    ownerId?: string;
    owner$?: { id?: string; name?: string };
    /** The AWS account the cloud runs in, one per cloud. */
    accountNo?: string;
    /** The goods workspace the cloud was provisioned into; absent until it is. */
    workspaceId?: string;
}

/** One request per hundred clouds; the walk follows further pages when there are any. */
export const DOU_CLOUD_PAGE_SIZE = 100;

/**
 * Query params for one page. `valid: 0` keeps expired clouds in the list — they still have goods
 * products, and an expired cloud missing from the join would read as "not a DoU cloud".
 */
export const buildDouCloudListParams = (page: number): Record<string, string | number> => ({
    view: 'admin',
    valid: 0,
    limit: DOU_CLOUD_PAGE_SIZE,
    page,
});

/** Every cloud the relay at `base` (`https://host/dou-v1`) knows of. */
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
