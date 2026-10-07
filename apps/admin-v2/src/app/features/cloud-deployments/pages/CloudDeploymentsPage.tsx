/**
 * `pages/cloud-deployments/CloudDeploymentsPage.tsx`
 * - Redeploys the subscription clouds after a server update: list them, pick, confirm, run.
 *
 * The page holds the picks; the rules — grouping, which calls a pick turns into, the paced run —
 * live in `lib/` where they are tested, and the run itself in `useDeployRun`.
 *
 * Unlike the other consoles, nothing here lives in the URL. Those screens read; this one deploys, and
 * a refreshed tab or a shared link that reopened on production with clouds picked is the wrong thing
 * to make easy. The screen opens on the stage the `.env` names, with nothing picked, every time.
 *
 * Nothing here polls. A queued deploy shows its progress on the product only after Refresh.
 */
import { useMemo, useState } from 'react';

import { Badge } from '@chatic/ui-kit/components/ui/badge';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { useDouClouds, useServiceProductLists } from '../api/deploymentsQuery';
import { CloudGroupTable } from '../components/CloudGroupTable';
import { DeployConfirmDialog } from '../components/DeployConfirmDialog';
import { DeployFilterBar } from '../components/DeployFilterBar';
import { DeployResultList } from '../components/DeployResultList';
import { useDeployRun } from '../hooks/use-deploy-run';
import {
    buildCloudGroups,
    CLOUD_SERVICES,
    DEFAULT_GROUP_SORT,
    SERVICE_CODES,
    sortCloudGroups,
    type CloudService,
    type GroupSort,
} from '../lib/cloudGroups';
import { countClouds, matchesCloudStage, planDeploys, type CloudStageFilter } from '../lib/deployPlan';
import {
    configuredRelayEndpoint,
    describeGoodsTarget,
    douBaseFor,
    GOODS_STAGE_LABEL,
    GOODS_STAGES,
    goodsBaseFor,
    initialGoodsStage,
    isGoodsStage,
    type GoodsStage,
} from '../lib/goodsTarget';

/** A copy of `set` with `items` added (`on`) or removed. */
const withMembers = <T,>(set: ReadonlySet<T>, items: readonly T[], on: boolean): ReadonlySet<T> => {
    const next = new Set(set);
    items.forEach(item => (on ? next.add(item) : next.delete(item)));
    return next;
};

export const CloudDeploymentsPage = () => {
    const endpoint = configuredRelayEndpoint();
    const [stage, setStage] = useState<GoodsStage>(() => initialGoodsStage(endpoint));
    const base = goodsBaseFor(endpoint, stage);
    const target = describeGoodsTarget(endpoint, stage);
    const { lists, errors, isLoading, isFetching, refetch: refetchLists } = useServiceProductLists(stage, base);
    const dou = useDouClouds(stage, douBaseFor(endpoint, stage));
    const refetch = () => {
        refetchLists();
        void dou.refetch();
    };

    const [stageFilter, setStageFilter] = useState<CloudStageFilter>('all');
    const [services, setServices] = useState<ReadonlySet<CloudService>>(() => new Set(CLOUD_SERVICES));
    const [branches, setBranches] = useState<Partial<Record<CloudService, string>>>({});
    const [force, setForce] = useState(true);
    const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
    const [confirming, setConfirming] = useState(false);
    const [sort, setSort] = useState<GroupSort>(DEFAULT_GROUP_SORT);
    const { run, running, start, stop, clear } = useDeployRun();

    // A failed relay call leaves every row on its goods owner rather than holding the table back: the
    // DoU details say whose cloud it is, not what gets deployed.
    const douClouds = dou.data;
    const grouping = useMemo(
        () =>
            lists &&
            buildCloudGroups(
                { backend: lists.backend.list, sockets: lists.sockets.list, socials: lists.socials.list },
                douClouds
            ),
        [lists, douClouds]
    );
    // The calls follow the table, so the sort shown is also the order the run deploys in.
    const groups = useMemo(() => (grouping ? sortCloudGroups(grouping.groups, sort) : []), [grouping, sort]);
    const visible = groups.filter(group => matchesCloudStage(group, stageFilter));
    const calls = planDeploys({ groups, selected, stageFilter, services, branches, force });
    const cloudCount = countClouds(calls);
    const truncated = lists ? CLOUD_SERVICES.filter(service => lists[service].truncated) : [];

    const changeStage = (next: GoodsStage) => {
        setStage(next);
        // Project ids and results belong to the goods service they came from.
        setSelected(new Set());
        clear();
    };

    const confirmRun = () => {
        setConfirming(false);
        start(base, target, calls);
    };

    const main = !base ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            VITE_DOU_ENDPOINT is not set, so there is no goods service to call.
        </p>
    ) : errors.length > 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-16">
            <p className="text-sm text-red-400">Failed to load the product lists</p>
            {/* One failed list blocks the table: grouping without it would mark every cloud partial
                and silently leave that service out of the run. */}
            <ul className="max-w-2xl space-y-1 text-xs text-red-400">
                {errors.map(error => (
                    <li key={error.service} className="break-all">
                        <span className="font-mono">{SERVICE_CODES[error.service]}</span>: {error.message}
                    </li>
                ))}
            </ul>
            <Button size="sm" variant="outline" className="h-7" onClick={refetch}>
                Try again
            </Button>
        </div>
    ) : isLoading || dou.isLoading || !grouping ? (
        <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-3 rounded bg-muted" style={{ width: `${90 - (i % 4) * 12}%` }} />
            ))}
        </div>
    ) : (
        <CloudGroupTable
            groups={visible}
            selected={selected}
            onToggle={(projectId, on) => setSelected(prev => withMembers(prev, [projectId], on))}
            onToggleAll={on =>
                setSelected(prev =>
                    withMembers(
                        prev,
                        visible.map(group => group.projectId),
                        on
                    )
                )
            }
            douUnavailable={!douClouds}
            sort={sort}
            onSort={key =>
                setSort(prev =>
                    prev.key === key
                        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
                        : { key, direction: 'asc' }
                )
            }
            disabled={running}
        />
    );

    return (
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
            <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-sm font-semibold text-foreground">Cloud Deployments</h1>
                    {(isFetching || dou.isFetching) && <span className="text-xs text-muted-foreground">Loading…</span>}
                    <span className="flex-1" />

                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        Goods stage
                        <select
                            className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-ring disabled:opacity-50"
                            value={stage}
                            disabled={running}
                            onChange={event => {
                                const next = event.target.value;
                                if (isGoodsStage(next)) changeStage(next);
                            }}
                        >
                            {GOODS_STAGES.map(value => (
                                <option key={value} value={value}>
                                    {GOODS_STAGE_LABEL[value]} (cgs-{value})
                                </option>
                            ))}
                        </select>
                    </label>

                    <Button size="sm" variant="outline" className="h-7" disabled={!base} onClick={refetch}>
                        Refresh
                    </Button>

                    {/* admin-v2 is not deployed — a run calls whatever this resolves to. */}
                    <Badge variant={target.isProd ? 'destructive' : 'outline'}>{target.label}</Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">{target.endpoint}</span>
                </div>

                <DeployFilterBar
                    stageFilter={stageFilter}
                    onStageFilterChange={setStageFilter}
                    services={services}
                    onToggleService={(service, on) => setServices(prev => withMembers(prev, [service], on))}
                    branches={branches}
                    onBranchChange={(service, branch) => setBranches(prev => ({ ...prev, [service]: branch }))}
                    force={force}
                    onForceChange={setForce}
                />

                {/* A failed refresh keeps the last list, so what the table shows depends on whether one
                    ever arrived. */}
                {dou.error && (
                    <p className="break-all text-xs text-amber-400">
                        {douClouds
                            ? `DoU cloud details could not be refreshed (${dou.error.message}). The owners and DoU status shown are from the last load.`
                            : `DoU cloud details could not be loaded (${dou.error.message}). Owners are shown as the goods service recorded them, and DoU status is unknown.`}
                    </p>
                )}
                {truncated.length > 0 && (
                    <p className="text-xs text-amber-400">
                        {truncated.map(service => SERVICE_CODES[service]).join(', ')}: the list stopped at the goods
                        service&apos;s paging limit. Products past it are not shown and cannot be deployed from here.
                    </p>
                )}
                {grouping && grouping.leftOut.length > 0 && (
                    <p className="break-all text-xs text-amber-400">
                        {grouping.leftOut.length} product(s) fit no cloud row (no id or no project, or a second product
                        of one service in the same cloud) and are not deployed from here:{' '}
                        <span className="font-mono">
                            {grouping.leftOut.map(product => product.id ?? '?').join(', ')}
                        </span>
                    </p>
                )}
            </div>

            <div className="flex min-h-0 flex-1">
                {/* A <section>, not a <main>: `PrivateLayout` already renders the page's `main`. */}
                <section className="flex min-w-0 flex-1 flex-col overflow-auto">{main}</section>
                <aside className="w-80 shrink-0 overflow-auto border-l border-border xl:w-96">
                    {run ? (
                        <DeployResultList
                            target={run.target}
                            total={run.calls.length}
                            results={run.results}
                            summary={run.summary}
                        />
                    ) : (
                        <p className="p-4 text-xs text-muted-foreground">The results of a deploy run show here.</p>
                    )}
                </aside>
            </div>

            <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground">
                <span className="tabular-nums">
                    {visible.length} cloud{visible.length === 1 ? '' : 's'} shown · {cloudCount} to deploy
                </span>
                <span className="flex-1" />
                {running && run ? (
                    <>
                        <span className="tabular-nums text-foreground">
                            Deploying {run.results.length} / {run.calls.length}
                        </span>
                        <Button size="sm" variant="destructive" disabled={run.stopping} onClick={stop}>
                            {run.stopping ? 'Stopping…' : 'Stop'}
                        </Button>
                    </>
                ) : (
                    <Button size="sm" disabled={calls.length === 0} onClick={() => setConfirming(true)}>
                        Deploy {calls.length} product{calls.length === 1 ? '' : 's'}
                    </Button>
                )}
            </div>

            <DeployConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                target={target}
                cloudCount={cloudCount}
                productCount={calls.length}
                services={services}
                branches={branches}
                force={force}
                onConfirm={confirmRun}
            />
        </div>
    );
};
