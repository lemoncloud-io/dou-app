import type { DouCloud } from '../api/douCloudsApi';
import type { GoodsProduct, GoodsProgress } from '../api/goodsApi';

export type CloudService = 'backend' | 'sockets' | 'socials';

export const CLOUD_SERVICES: readonly CloudService[] = ['backend', 'sockets', 'socials'];

export const SERVICE_CODES: Record<CloudService, string> = {
    backend: 'chatic-backend-api',
    sockets: 'chatic-sockets-api',
    socials: 'chatic-socials-api',
};

export interface ProductSummary {
    id: string;
    status?: string;
    progress?: GoodsProgress;
    deployedAt?: number;
    deployingAt?: number;
}

export type OwnerSource = 'dou' | 'goods';

export interface DouCloudSummary {
    id?: string;
    name?: string;
    status?: string;
    accountNo?: string;
}

export interface CloudGroup {
    projectId: string;
    cloudStage?: string;
    workspaceId?: string;
    ownerId?: string;
    ownerName?: string;
    ownerSource: OwnerSource;
    dou?: DouCloudSummary;
    products: Partial<Record<CloudService, ProductSummary>>;
    partial: boolean;
}

export interface CloudGrouping {
    groups: CloudGroup[];
    leftOut: GoodsProduct[];
}

export const findForeignProducts = (service: CloudService, list: GoodsProduct[]): GoodsProduct[] =>
    list.filter(product => product.code !== SERVICE_CODES[service]);

export const isAwaitingResult = ({ deployedAt, deployingAt }: ProductSummary): boolean =>
    !!deployingAt && (!deployedAt || deployingAt > deployedAt);

type PlacedProduct = GoodsProduct & { id: string; projectId: string };

const isPlaced = (product: GoodsProduct): product is PlacedProduct => !!product.id && !!product.projectId;

const firstValue = (values: (string | undefined)[]): string | undefined => values.find(value => !!value);

const NAME_ORDER = new Intl.Collator('en', { sensitivity: 'base' });

const compareName = (a: string, b: string): number => NAME_ORDER.compare(a, b);

export type GroupSortKey = 'owner' | 'ownerId' | 'cloudId';

export interface GroupSort {
    key: GroupSortKey;
    direction: 'asc' | 'desc';
}

export const DEFAULT_GROUP_SORT: GroupSort = { key: 'owner', direction: 'asc' };

const ID_ORDER = new Intl.Collator('en', { numeric: true });

const compareId = (a: string | undefined, b: string | undefined): number => ID_ORDER.compare(a ?? '', b ?? '');

const ownerKey = (group: CloudGroup): string | undefined =>
    group.ownerId ? `${group.ownerSource}:${group.ownerId}` : undefined;

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
        const present: PlacedProduct[] = [];
        const products: CloudGroup['products'] = {};
        CLOUD_SERVICES.forEach(service => {
            const product = entry[service];
            if (!product) return;
            present.push(product);
            products[service] = {
                id: product.id,
                status: product.status,
                progress: product.progress$,
                deployedAt: product.deployedAt,
                deployingAt: product.deployingAt,
            };
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
