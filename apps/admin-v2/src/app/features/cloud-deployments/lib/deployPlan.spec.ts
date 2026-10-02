/**
 * `lib/cloud-deployments/deployPlan.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { buildDeployParams, countClouds, planDeploys, type DeployPlanInput } from './deployPlan';

import type { CloudGroup, CloudService } from './cloudGroups';

const group = (
    projectId: string,
    cloudStage: string,
    services: CloudService[] = ['backend', 'sockets', 'socials']
): CloudGroup => ({
    projectId,
    cloudStage,
    ownerId: `owner-${projectId}`,
    ownerName: `Owner ${projectId}`,
    ownerSource: 'goods',
    products: Object.fromEntries(services.map(service => [service, { id: `${service}-${projectId}` }])),
    partial: services.length < 3,
});

const GROUPS = [group('p1', 'prod'), group('p2', 'dev'), group('p3', 'prod', ['backend', 'socials'])];

const input = (over: Partial<DeployPlanInput> = {}): DeployPlanInput => ({
    groups: GROUPS,
    selected: new Set(['p1', 'p2', 'p3']),
    stageFilter: 'all',
    services: new Set<CloudService>(['backend', 'sockets', 'socials']),
    branches: {},
    force: true,
    ...over,
});

const ids = (over: Partial<DeployPlanInput>) => planDeploys(input(over)).map(call => call.productId);

describe('planDeploys', () => {
    it('deploys only picked groups that pass the cloud stage filter', () => {
        expect(ids({ selected: new Set(['p1', 'p2']), stageFilter: 'prod' })).toEqual([
            'backend-p1',
            'sockets-p1',
            'socials-p1',
        ]);
        expect(ids({ selected: new Set(['p3']), stageFilter: 'dev' })).toEqual([]);
    });

    it('follows table order, backend then sockets then socials inside a group, skipping a missing service', () => {
        expect(ids({})).toEqual([
            'backend-p1',
            'sockets-p1',
            'socials-p1',
            'backend-p2',
            'sockets-p2',
            'socials-p2',
            'backend-p3',
            'socials-p3',
        ]);
    });

    it('deploys only the picked services', () => {
        expect(ids({ services: new Set<CloudService>(['sockets']) })).toEqual(['sockets-p1', 'sockets-p2']);
    });

    it('trims each service branch and leaves a blank one out of the params', () => {
        const calls = planDeploys(
            input({ selected: new Set(['p1']), branches: { backend: '  release/1.2 ', sockets: '   ' }, force: false })
        );

        expect(calls.map(call => [call.service, call.branch, call.params])).toEqual([
            ['backend', 'release/1.2', { branch: 'release/1.2' }],
            ['sockets', undefined, {}],
            ['socials', undefined, {}],
        ]);
    });

    it('carries the owner and cloud of each call for the results list', () => {
        expect(planDeploys(input({ selected: new Set(['p2']) }))[0]).toMatchObject({
            projectId: 'p2',
            ownerId: 'owner-p2',
            ownerName: 'Owner p2',
            service: 'backend',
            force: true,
        });
    });
});

describe('buildDeployParams', () => {
    it('sends force only when it is on, and never async or dryRun', () => {
        expect(buildDeployParams({ force: true })).toEqual({ force: 1 });
        expect(buildDeployParams({ force: false })).toEqual({});
        expect(buildDeployParams({ force: true, branch: 'main' })).toEqual({ force: 1, branch: 'main' });
    });
});

describe('countClouds', () => {
    it('counts each cloud once however many of its services are deployed', () => {
        expect(countClouds(planDeploys(input({})))).toBe(3);
        expect(countClouds([])).toBe(0);
    });
});
