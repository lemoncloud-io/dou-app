/**
 * `lib/cloud-deployments/cloudGroups.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import {
    buildCloudGroups,
    findForeignProducts,
    SERVICE_CODES,
    sortCloudGroups,
    type CloudGroup,
    type CloudService,
    type GroupSort,
} from './cloudGroups';

import type { DouCloud } from '../api/douCloudsApi';
import type { GoodsProduct } from '../api/goodsApi';

const product = (service: CloudService, projectId: string, over: Partial<GoodsProduct> = {}): GoodsProduct => ({
    id: `${service}-${projectId}`,
    code: SERVICE_CODES[service],
    projectId,
    project$: { stereo: 'prod' },
    ownerId: 'u1',
    owner$: { name: 'Alice' },
    workspaceId: `w-${projectId}`,
    status: 'ready',
    ...over,
});

const douCloud = (workspaceId: string, over: Partial<DouCloud> = {}): DouCloud => ({
    id: `dou-${workspaceId}`,
    name: `dou cloud ${workspaceId}`,
    status: 'active',
    ownerId: 'd1',
    owner$: { id: 'd1', name: 'Dana' },
    accountNo: `acct-${workspaceId}`,
    workspaceId,
    ...over,
});

const lists = (
    backend: GoodsProduct[],
    sockets: GoodsProduct[] = [],
    socials: GoodsProduct[] = []
): Record<CloudService, GoodsProduct[]> => ({ backend, sockets, socials });

describe('buildCloudGroups', () => {
    it('merges the three service lists into one group per project', () => {
        const { groups, leftOut } = buildCloudGroups(
            lists(
                [product('backend', 'p1'), product('backend', 'p2')],
                [product('sockets', 'p2'), product('sockets', 'p1')],
                [product('socials', 'p1', { progress$: { state: 'done', status: 'ready' } }), product('socials', 'p2')]
            )
        );

        expect(leftOut).toEqual([]);
        expect(groups).toHaveLength(2);
        expect(groups[0]).toEqual({
            projectId: 'p1',
            cloudStage: 'prod',
            workspaceId: 'w-p1',
            ownerId: 'u1',
            ownerName: 'Alice',
            ownerSource: 'goods',
            dou: undefined,
            products: {
                backend: { id: 'backend-p1', status: 'ready', progress: undefined },
                sockets: { id: 'sockets-p1', status: 'ready', progress: undefined },
                socials: { id: 'socials-p1', status: 'ready', progress: { state: 'done', status: 'ready' } },
            },
            partial: false,
        });
    });

    it('keeps a group missing a service and marks it partial', () => {
        const { groups } = buildCloudGroups(lists([product('backend', 'p1')], [], [product('socials', 'p1')]));

        expect(groups).toHaveLength(1);
        expect(groups[0].partial).toBe(true);
        expect(Object.keys(groups[0].products)).toEqual(['backend', 'socials']);
    });

    it("fills an empty owner or cloud stage from another service's product", () => {
        const { groups } = buildCloudGroups(
            lists(
                [product('backend', 'p1', { ownerId: undefined, owner$: undefined, project$: {} })],
                [product('sockets', 'p1', { ownerId: 'u9', owner$: { name: 'Zed' }, project$: { stereo: 'dev' } })]
            )
        );

        expect(groups[0]).toMatchObject({
            ownerId: 'u9',
            ownerName: 'Zed',
            cloudStage: 'dev',
        });
    });

    it('sorts by owner name, owner id and project, so one owner sits together and no name goes last', () => {
        const { groups } = buildCloudGroups(
            lists([
                product('backend', 'p4', { ownerId: 'u3', owner$: undefined }),
                product('backend', 'p3', { ownerId: 'u2', owner$: { name: 'Bob' } }),
                product('backend', 'p2', { ownerId: 'u1', owner$: { name: 'Alice' } }),
                // Same owner as p2 under an older copy of the name — it still sorts beside p2.
                product('backend', 'p5', { ownerId: 'u1', owner$: { name: 'Zoe' } }),
                product('backend', 'p1', { ownerId: 'u0', owner$: { name: 'Alice' } }),
            ])
        );

        expect(groups.map(group => group.projectId)).toEqual(['p1', 'p2', 'p5', 'p3', 'p4']);
    });

    it('returns products no group can take instead of dropping them', () => {
        const orphan = product('backend', '', { projectId: undefined });
        const second = product('sockets', 'p1', { id: 'sockets-p1-again' });
        const { groups, leftOut } = buildCloudGroups(
            lists([orphan, product('backend', 'p1')], [product('sockets', 'p1'), second])
        );

        expect(groups).toHaveLength(1);
        expect(groups[0].products.sockets?.id).toBe('sockets-p1');
        expect(leftOut).toEqual([orphan, second]);
    });
});

describe('buildCloudGroups with DoU clouds', () => {
    it('links a project to the DoU cloud of its workspace and shows the DoU owner', () => {
        const { groups } = buildCloudGroups(lists([product('backend', 'p1', { ownerId: 'chatic-backend-api.x.7' })]), [
            douCloud('w-p1', { status: 'suspended' }),
        ]);

        expect(groups[0]).toMatchObject({
            ownerId: 'd1',
            ownerName: 'Dana',
            ownerSource: 'dou',
            dou: { id: 'dou-w-p1', name: 'dou cloud w-p1', status: 'suspended', accountNo: 'acct-w-p1' },
        });
    });

    it('keeps the goods owner for a project no DoU cloud links to, and ignores clouds never provisioned', () => {
        const { groups } = buildCloudGroups(lists([product('backend', 'p1')]), [
            douCloud('w-other'),
            douCloud('', { workspaceId: undefined }),
        ]);

        expect(groups[0]).toMatchObject({ ownerId: 'u1', ownerName: 'Alice', ownerSource: 'goods', dou: undefined });
    });

    it('puts DoU-owned clouds first and keeps one DoU owner together, never merging the two id systems', () => {
        const { groups } = buildCloudGroups(
            lists([
                // A goods owner whose id happens to equal a DoU user id is still a different owner.
                product('backend', 'g1', { ownerId: 'd1', owner$: { name: 'Aaron' } }),
                product('backend', 'p2'),
                product('backend', 'p1'),
                product('backend', 'p3'),
            ]),
            [douCloud('w-p1'), douCloud('w-p2', { ownerId: 'd2', owner$: { id: 'd2', name: 'Bea' } }), douCloud('w-p3')]
        );

        expect(groups.map(group => [group.projectId, group.ownerSource])).toEqual([
            ['p2', 'dou'],
            ['p1', 'dou'],
            ['p3', 'dou'],
            ['g1', 'goods'],
        ]);
    });
});

describe('sortCloudGroups', () => {
    const group = (projectId: string, over: Partial<CloudGroup>): CloudGroup => ({
        projectId,
        ownerSource: 'dou',
        products: {},
        partial: false,
        ...over,
    });
    const GROUPS = [
        group('a', { ownerId: '1000010', ownerName: 'Bea', dou: { id: '1000003' } }),
        group('b', { ownerId: '999', ownerName: 'Cal', dou: { id: '20' } }),
        group('c', { ownerId: '1000002', ownerName: 'Ann', dou: { id: '1000001' } }),
        group('z', { ownerId: '1', ownerName: 'Aaa', ownerSource: 'goods' }),
    ];
    const order = (sort: GroupSort) => sortCloudGroups(GROUPS, sort).map(row => row.projectId);

    it('sorts by owner name either way, keeping goods owners after DoU owners', () => {
        expect(order({ key: 'owner', direction: 'asc' })).toEqual(['c', 'a', 'b', 'z']);
        expect(order({ key: 'owner', direction: 'desc' })).toEqual(['b', 'a', 'c', 'z']);
        // Names in reading order: case does not put `alice` after `Zed`.
        const cased = [
            group('z', { ownerName: 'Zed' }),
            group('a', { ownerName: 'alice' }),
            group('b', { ownerName: 'Bob' }),
        ];
        expect(sortCloudGroups(cased, { key: 'owner', direction: 'asc' }).map(row => row.projectId)).toEqual([
            'a',
            'b',
            'z',
        ]);
    });

    it('sorts owner ids as numbers, keeping goods owners after DoU owners', () => {
        expect(order({ key: 'ownerId', direction: 'asc' })).toEqual(['b', 'c', 'a', 'z']);
        expect(order({ key: 'ownerId', direction: 'desc' })).toEqual(['a', 'c', 'b', 'z']);
    });

    it('sorts by DoU cloud id as numbers, with clouds DoU does not know last either way', () => {
        expect(order({ key: 'cloudId', direction: 'asc' })).toEqual(['b', 'c', 'a', 'z']);
        expect(order({ key: 'cloudId', direction: 'desc' })).toEqual(['a', 'c', 'b', 'z']);
    });
});

describe('findForeignProducts', () => {
    it('finds products of another service in a list', () => {
        const foreign = product('sockets', 'p1');
        expect(findForeignProducts('backend', [product('backend', 'p1'), foreign])).toEqual([foreign]);
    });

    it('finds nothing when every product is the requested service', () => {
        expect(findForeignProducts('socials', [product('socials', 'p1'), product('socials', 'p2')])).toEqual([]);
    });
});
