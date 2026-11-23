import { CLOUD_SERVICES, type CloudGroup, type CloudService } from './cloudGroups';

export type CloudStageFilter = 'all' | 'dev' | 'prod';

export const CLOUD_STAGE_FILTERS: readonly CloudStageFilter[] = ['all', 'dev', 'prod'];

export interface DeployCall {
    productId: string;
    projectId: string;
    service: CloudService;
    ownerName?: string;
    ownerId?: string;
    branch?: string;
    force: boolean;
    slack: boolean;
    params: Record<string, string | number>;
}

export interface DeployPlanInput {
    groups: CloudGroup[];
    selected: ReadonlySet<string>;
    stageFilter: CloudStageFilter;
    services: ReadonlySet<CloudService>;
    branches: Partial<Record<CloudService, string>>;
    force: boolean;
    slack: boolean;
}

export const matchesCloudStage = (group: CloudGroup, filter: CloudStageFilter): boolean =>
    filter === 'all' || group.cloudStage === filter;

export const DEFAULT_BRANCH = 'develop';

export const normalizeBranch = (branch: string | undefined): string | undefined => branch?.trim() || undefined;

export const buildDeployParams = ({
    force,
    branch,
    slack,
}: {
    force: boolean;
    branch?: string;
    slack: boolean;
}): Record<string, string | number> => ({
    ...(force ? { force: 1 } : {}),
    ...(branch ? { branch } : {}),
    ...(slack ? {} : { slack: 0 }),
});

export const planDeploys = ({
    groups,
    selected,
    stageFilter,
    services,
    branches,
    force,
    slack,
}: DeployPlanInput): DeployCall[] =>
    groups
        .filter(group => selected.has(group.projectId) && matchesCloudStage(group, stageFilter))
        .flatMap(group =>
            CLOUD_SERVICES.filter(service => services.has(service)).flatMap(service => {
                const product = group.products[service];
                if (!product) return [];
                const branch = normalizeBranch(branches[service]);
                return [
                    {
                        productId: product.id,
                        projectId: group.projectId,
                        service,
                        ownerName: group.ownerName,
                        ownerId: group.ownerId,
                        branch,
                        force,
                        slack,
                        params: buildDeployParams({ force, branch, slack }),
                    },
                ];
            })
        );

export const countClouds = (calls: DeployCall[]): number => new Set(calls.map(call => call.projectId)).size;
