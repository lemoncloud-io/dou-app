/**
 * `lib/cloud-deployments/deployPlan.ts`
 * - What the operator picked, turned into the list of auto-deploy calls to make.
 *
 * The call list is fixed when the operator confirms: the run works through the list it was handed,
 * so changing a filter afterwards changes what the table shows, never what is being deployed.
 */
import { CLOUD_SERVICES, type CloudGroup, type CloudService } from './cloudGroups';

export type CloudStageFilter = 'all' | 'dev' | 'prod';

export const CLOUD_STAGE_FILTERS: readonly CloudStageFilter[] = ['all', 'dev', 'prod'];

export interface DeployCall {
    productId: string;
    projectId: string;
    service: CloudService;
    /** Shown in the results list, so a failure can be traced to whose cloud it was. */
    ownerName?: string;
    ownerId?: string;
    /** Absent means the goods service picks its own default branch. */
    branch?: string;
    force: boolean;
    params: Record<string, string | number>;
}

export interface DeployPlanInput {
    /** In table order — the calls follow it. */
    groups: CloudGroup[];
    /** Picked groups, by `projectId`. */
    selected: ReadonlySet<string>;
    stageFilter: CloudStageFilter;
    services: ReadonlySet<CloudService>;
    branches: Partial<Record<CloudService, string>>;
    force: boolean;
}

export const matchesCloudStage = (group: CloudGroup, filter: CloudStageFilter): boolean =>
    filter === 'all' || group.cloudStage === filter;

/**
 * What the goods service deploys when no branch is sent: the service catalog's own branch if it names
 * one, otherwise this. Shown on screen as the default; sending it explicitly is not the same thing.
 */
export const DEFAULT_BRANCH = 'develop';

/** A blank branch box means "no branch", not a branch named by its whitespace. */
export const normalizeBranch = (branch: string | undefined): string | undefined => branch?.trim() || undefined;

/**
 * Query params for one auto-deploy call: `force` and `branch`, each only when set.
 *
 * `async` is never sent. The goods service reads a present-but-empty `async` as "run synchronously",
 * and a synchronous deploy outlives the gateway's 29-second limit. `dryRun` is not sent either.
 */
export const buildDeployParams = ({
    force,
    branch,
}: {
    force: boolean;
    branch?: string;
}): Record<string, string | number> => ({
    ...(force ? { force: 1 } : {}),
    ...(branch ? { branch } : {}),
});

/**
 * The calls to make, in table order and backend → sockets → socials inside a group.
 *
 * A group counts only if it is picked AND passes the cloud stage filter: a group picked under "all"
 * and then filtered out of view is not deployed by a run started under "prod". A service a group is
 * missing yields no call.
 */
export const planDeploys = ({
    groups,
    selected,
    stageFilter,
    services,
    branches,
    force,
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
                        params: buildDeployParams({ force, branch }),
                    },
                ];
            })
        );

/** Distinct clouds a call list touches — the count the confirmation dialog names. */
export const countClouds = (calls: DeployCall[]): number => new Set(calls.map(call => call.projectId)).size;
