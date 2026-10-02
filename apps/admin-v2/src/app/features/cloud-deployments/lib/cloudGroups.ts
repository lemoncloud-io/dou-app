/**
 * `lib/cloud-deployments/cloudGroups.ts`
 * - Three per-service product lists, folded into one row per subscription cloud.
 *
 * The goods service deploys each of the three services to a subscription cloud as its own product,
 * and the cloud they share is the goods project (`projectId`). So a group is one project and its
 * products, one per service; the rows are the goods products, because they are what gets deployed.
 *
 * Whose cloud it is comes from the relay where it can: the DoU cloud that shares the project's
 * `workspaceId` names the subscriber. A project with no DoU cloud — made in the goods service
 * directly — keeps the owner its products carry, a copy from when they were saved. The two are
 * different id systems, so an owner is always one or the other and the two are never merged.
 */
import type { DouCloud } from '../api/douCloudsApi';
import type { GoodsProduct, GoodsProgress } from '../api/goodsApi';

export type CloudService = 'backend' | 'sockets' | 'socials';

/** Also the order products are deployed in, inside a group. */
export const CLOUD_SERVICES: readonly CloudService[] = ['backend', 'sockets', 'socials'];

/** The goods `code` of each service — the value the list is filtered by. */
export const SERVICE_CODES: Record<CloudService, string> = {
    backend: 'chatic-backend-api',
    sockets: 'chatic-sockets-api',
    socials: 'chatic-socials-api',
};

export interface ProductSummary {
    id: string;
    status?: string;
    progress?: GoodsProgress;
}

/** Where a group's owner was read from: the linked DoU cloud, or the goods products. */
export type OwnerSource = 'dou' | 'goods';

/** The DoU cloud a group is linked to. */
export interface DouCloudSummary {
    id?: string;
    name?: string;
    status?: string;
    accountNo?: string;
}

export interface CloudGroup {
    projectId: string;
    /** `project$.stereo` — the cloud's own dev/prod mark, unrelated to the goods stage. */
    cloudStage?: string;
    workspaceId?: string;
    ownerId?: string;
    ownerName?: string;
    ownerSource: OwnerSource;
    /** Absent when no DoU cloud shares the project's workspace. */
    dou?: DouCloudSummary;
    products: Partial<Record<CloudService, ProductSummary>>;
    /** A service is missing. The missing one is never deployed from this group. */
    partial: boolean;
}

export interface CloudGrouping {
    groups: CloudGroup[];
    /**
     * Products no group could take: no `id` or no `projectId`, or a second product of the same
     * service in one cloud. Returned rather than dropped, because a product left off the table is a product that
     * silently never gets deployed.
     */
    leftOut: GoodsProduct[];
}

/**
 * Products whose `code` is not the service that was asked for.
 *
 * A goods service without the list filter ignores `code` and returns every product it has, so a
 * single foreign product means the whole list is unfiltered. The caller rejects the list on any hit
 * rather than filtering it here — an unfiltered list stops at the page cap, and the products past it
 * would be missing without a word.
 */
export const findForeignProducts = (service: CloudService, list: GoodsProduct[]): GoodsProduct[] =>
    list.filter(product => product.code !== SERVICE_CODES[service]);

/** A product a row can hold: it names both itself and its cloud. */
type PlacedProduct = GoodsProduct & { id: string; projectId: string };

const isPlaced = (product: GoodsProduct): product is PlacedProduct => !!product.id && !!product.projectId;

const firstValue = (values: (string | undefined)[]): string | undefined => values.find(value => !!value);

/** Names in reading order, not code-unit order: `alice` beside `Alice`, not after `Zed`. */
const NAME_ORDER = new Intl.Collator('en', { sensitivity: 'base' });

const compareName = (a: string, b: string): number => NAME_ORDER.compare(a, b);

/** What the table can be sorted by: owner name (the default), owner id, or DoU cloud id. */
export type GroupSortKey = 'owner' | 'ownerId' | 'cloudId';

export interface GroupSort {
    key: GroupSortKey;
    direction: 'asc' | 'desc';
}

/** Owner name order is the default because it keeps one owner's clouds together. */
export const DEFAULT_GROUP_SORT: GroupSort = { key: 'owner', direction: 'asc' };

/** Ids are numbers kept as strings; compare them as numbers so `1000010` follows `1000009`. */
const ID_ORDER = new Intl.Collator('en', { numeric: true });

const compareId = (a: string | undefined, b: string | undefined): number => ID_ORDER.compare(a ?? '', b ?? '');

/** An owner is only ever the same as another from the same source — the ids are not shared. */
const ownerKey = (group: CloudGroup): string | undefined =>
    group.ownerId ? `${group.ownerSource}:${group.ownerId}` : undefined;

/**
 * The table order for a sort.
 *
 * Owner name compares one name per owner rather than each row's own copy: one owner's clouds can
 * carry different copies, and sorting by the copy would split them apart. Under either owner sort,
 * DoU-owned clouds come before goods-owned ones, whichever the direction — the two id systems do not
 * compare. A row with nothing to sort by (no name, no id, no DoU cloud) goes last within its source,
 * either way. Ties fall back to the owner id, then the goods project.
 */
export const sortCloudGroups = (groups: readonly CloudGroup[], { key, direction }: GroupSort): CloudGroup[] => {
    const ownerNames = new Map<string, string>();
    groups.forEach(group => {
        const owner = ownerKey(group);
        if (!owner || !group.ownerName) return;
        const known = ownerNames.get(owner);
        if (known === undefined || compareName(group.ownerName, known) < 0) ownerNames.set(owner, group.ownerName);
    });
    const nameOf = (group: CloudGroup): string => {
        const owner = ownerKey(group);
        return (owner ? ownerNames.get(owner) : undefined) ?? group.ownerName ?? '';
    };
    const valueOf = (group: CloudGroup): string =>
        key === 'owner' ? nameOf(group) : key === 'ownerId' ? (group.ownerId ?? '') : (group.dou?.id ?? '');
    const compareValue = key === 'owner' ? compareName : compareId;
    const sign = direction === 'asc' ? 1 : -1;

    return [...groups].sort((a, b) => {
        if (key !== 'cloudId' && a.ownerSource !== b.ownerSource) return a.ownerSource === 'dou' ? -1 : 1;
        const valueA = valueOf(a);
        const valueB = valueOf(b);
        if (!valueA !== !valueB) return valueA ? -1 : 1;
        return (
            sign * compareValue(valueA, valueB) ||
            compareId(a.ownerId, b.ownerId) ||
            compareId(a.projectId, b.projectId)
        );
    });
};

/**
 * Folds the three service lists into cloud groups, links each to its DoU cloud, and puts them in the
 * default order. A DoU cloud with no `workspaceId` was never provisioned and links to nothing.
 */
export const buildCloudGroups = (
    lists: Record<CloudService, GoodsProduct[]>,
    douClouds: readonly DouCloud[] = []
): CloudGrouping => {
    const douByWorkspace = new Map(
        douClouds.flatMap((cloud): [string, DouCloud][] => (cloud.workspaceId ? [[cloud.workspaceId, cloud]] : []))
    );
    const byProject = new Map<string, Partial<Record<CloudService, PlacedProduct>>>();
    const leftOut: GoodsProduct[] = [];

    CLOUD_SERVICES.forEach(service => {
        lists[service].forEach(product => {
            if (!isPlaced(product)) {
                leftOut.push(product);
                return;
            }
            const entry = byProject.get(product.projectId) ?? {};
            if (entry[service]) {
                leftOut.push(product);
                return;
            }
            entry[service] = product;
            byProject.set(product.projectId, entry);
        });
    });

    const groups = [...byProject.entries()].map(([projectId, entry]): CloudGroup => {
        // Backend first, then sockets, then socials: a value one product lacks is taken from the next.
        const present: PlacedProduct[] = [];
        const products: CloudGroup['products'] = {};
        CLOUD_SERVICES.forEach(service => {
            const product = entry[service];
            if (!product) return;
            present.push(product);
            products[service] = { id: product.id, status: product.status, progress: product.progress$ };
        });

        const workspaceId = firstValue(present.map(product => product.workspaceId));
        const cloud = workspaceId ? douByWorkspace.get(workspaceId) : undefined;
        const owner = cloud
            ? { ownerId: cloud.owner$?.id ?? cloud.ownerId, ownerName: cloud.owner$?.name, ownerSource: 'dou' as const }
            : {
                  ownerId: firstValue(present.map(product => product.ownerId)),
                  ownerName: firstValue(present.map(product => product.owner$?.name)),
                  ownerSource: 'goods' as const,
              };

        return {
            projectId,
            cloudStage: firstValue(present.map(product => product.project$?.stereo)),
            workspaceId,
            ...owner,
            dou: cloud && { id: cloud.id, name: cloud.name, status: cloud.status, accountNo: cloud.accountNo },
            products,
            partial: present.length < CLOUD_SERVICES.length,
        };
    });

    return { groups: sortCloudGroups(groups, DEFAULT_GROUP_SORT), leftOut };
};
