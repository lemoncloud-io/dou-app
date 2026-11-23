import { formatDate } from '@chatic/shared';
import { Checkbox } from '@chatic/ui-kit/components/ui/checkbox';

import {
    CLOUD_SERVICES,
    isAwaitingResult,
    type CloudGroup,
    type GroupSort,
    type GroupSortKey,
    type ProductSummary,
} from '../lib/cloudGroups';

import type { JSX, ReactNode } from 'react';

interface CloudGroupTableProps {
    groups: CloudGroup[];
    selected: ReadonlySet<string>;
    onToggle: (projectId: string, on: boolean) => void;
    onToggleAll: (on: boolean) => void;
    douUnavailable: boolean;
    sort: GroupSort;
    onSort: (key: GroupSortKey) => void;
    disabled: boolean;
}

const HEAD_CLASS =
    'sticky top-0 z-10 whitespace-nowrap border-b border-border bg-card px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground';

const DOU_STATUS_TONE: Record<string, string> = {
    active: 'border-emerald-500/40 text-emerald-400',
    suspended: 'border-amber-500/40 text-amber-400',
    expired: 'border-red-500/40 text-red-400',
};

const SORT_LABEL: Record<GroupSortKey, string> = {
    owner: 'Sort by owner name',
    ownerId: 'Sort by owner id',
    cloudId: 'Sort by DoU cloud id',
};

interface SortButtonProps {
    sortKey: GroupSortKey;
    sort: GroupSort;
    onSort: (key: GroupSortKey) => void;
    children: ReactNode;
}

const SortButton = ({ sortKey, sort, onSort, children }: SortButtonProps): JSX.Element => {
    const active = sort.key === sortKey;
    return (
        <button
            type="button"
            aria-label={SORT_LABEL[sortKey]}
            onClick={() => onSort(sortKey)}
            className={`uppercase tracking-wider hover:text-foreground ${active ? 'text-foreground' : ''}`}
        >
            {children}
            {active && <span aria-hidden="true">{sort.direction === 'asc' ? ' ↑' : ' ↓'}</span>}
        </button>
    );
};

const ariaSort = (sort: GroupSort, keys: GroupSortKey[]): 'ascending' | 'descending' | 'none' =>
    keys.includes(sort.key) ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';

const CloudCell = ({ group }: { group: CloudGroup }): JSX.Element => {
    const partial = group.partial && (
        <span
            className="rounded border border-amber-500/40 px-1 text-amber-400"
            title="A service is missing from this cloud. Only the services shown are deployed."
        >
            partial
        </span>
    );

    if (!group.dou) {
        return (
            <td className="px-3 py-2 align-top">
                <div className="whitespace-nowrap text-[11px] text-foreground">
                    goods <span className="font-mono">{group.projectId}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">{partial}</div>
            </td>
        );
    }

    return (
        <td className="px-3 py-2 align-top">
            <div className="whitespace-nowrap text-foreground">
                {group.dou.name || '-'} · <span className="font-mono text-[11px]">{group.dou.id ?? '-'}</span>
            </div>
            <div className="flex items-center gap-1 whitespace-nowrap text-[10px] text-muted-foreground">
                <span className="font-mono">{group.dou.accountNo ?? '-'}</span>
                <span>
                    · goods <span className="font-mono">{group.projectId}</span>
                </span>
                {partial}
            </div>
        </td>
    );
};

const DouStatusCell = ({ group, unavailable }: { group: CloudGroup; unavailable: boolean }): JSX.Element =>
    group.dou ? (
        <td className="px-3 py-2 align-top">
            <span
                className={`rounded border px-1 py-px text-[10px] ${
                    DOU_STATUS_TONE[group.dou.status ?? ''] ?? 'border-border text-muted-foreground'
                }`}
            >
                {group.dou.status ?? '-'}
            </span>
        </td>
    ) : (
        <td
            className="whitespace-nowrap px-3 py-2 align-top text-[10px] text-muted-foreground"
            title={
                unavailable
                    ? 'The DoU cloud list could not be loaded.'
                    : "No DoU cloud shares this project's workspace."
            }
        >
            {unavailable ? 'unknown' : 'not in DoU'}
        </td>
    );

const ProductCell = ({ product }: { product?: ProductSummary }): JSX.Element => {
    if (!product) {
        return <td className="px-3 py-2 text-muted-foreground">—</td>;
    }
    const progress = product.progress;
    const failed = !!progress?.error;

    return (
        <td className="px-3 py-2 align-top">
            <div className="flex items-center gap-1.5 whitespace-nowrap text-[10px]">
                <span className="font-mono text-[11px] text-foreground">{product.id}</span>
                <span className="rounded border border-border px-1 py-px text-muted-foreground">
                    {product.status ?? '-'}
                </span>
                {progress && (
                    <span
                        className={failed ? 'text-red-400' : 'text-muted-foreground'}
                        title={progress.error || progress.msg || undefined}
                    >
                        {progress.state ?? '-'} · {progress.status ?? '-'}
                    </span>
                )}
            </div>
            {failed && <div className="truncate text-[10px] text-red-400">{progress?.error}</div>}
            <div
                className="whitespace-nowrap text-[10px] text-muted-foreground"
                title={product.deployingAt ? `Last deploy accepted ${formatDate(product.deployingAt)}` : undefined}
            >
                last result {formatDate(product.deployedAt)}
                {isAwaitingResult(product) && (
                    <span
                        className="ml-1.5 rounded border border-amber-500/40 px-1 text-amber-400"
                        title="A deploy was accepted after this result, and its own result has not come back yet. It stays if that result never returns."
                    >
                        awaiting result
                    </span>
                )}
            </div>
        </td>
    );
};

export const CloudGroupTable = ({
    groups,
    selected,
    onToggle,
    onToggleAll,
    douUnavailable,
    sort,
    onSort,
    disabled,
}: CloudGroupTableProps): JSX.Element => {
    if (groups.length === 0) {
        return <p className="px-4 py-12 text-center text-sm text-muted-foreground">No subscription clouds here</p>;
    }

    const pickedOnScreen = groups.filter(group => selected.has(group.projectId)).length;
    const allState = pickedOnScreen === 0 ? false : pickedOnScreen === groups.length ? true : 'indeterminate';

    return (
        <table className="w-full border-collapse text-xs">
            <thead>
                <tr>
                    <th className={HEAD_CLASS}>
                        <Checkbox
                            aria-label="Select every cloud shown"
                            checked={allState}
                            className="data-[state=indeterminate]:opacity-50"
                            disabled={disabled}
                            onCheckedChange={() => onToggleAll(allState !== true)}
                        />
                    </th>
                    <th className={HEAD_CLASS} aria-sort={ariaSort(sort, ['owner', 'ownerId'])}>
                        <SortButton sortKey="owner" sort={sort} onSort={onSort}>
                            Owner
                        </SortButton>{' '}
                        ·{' '}
                        <SortButton sortKey="ownerId" sort={sort} onSort={onSort}>
                            id
                        </SortButton>
                    </th>
                    <th className={HEAD_CLASS} aria-sort={ariaSort(sort, ['cloudId'])}>
                        <SortButton sortKey="cloudId" sort={sort} onSort={onSort}>
                            Cloud
                        </SortButton>
                    </th>
                    <th className={HEAD_CLASS}>DoU status</th>
                    <th className={HEAD_CLASS}>Stage</th>
                    {CLOUD_SERVICES.map(service => (
                        <th key={service} className={HEAD_CLASS}>
                            {service}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {groups.map(group => {
                    const isSelected = selected.has(group.projectId);
                    return (
                        <tr key={group.projectId} className={`border-b border-border ${isSelected ? 'bg-accent' : ''}`}>
                            <td className="px-3 py-2 align-top">
                                <Checkbox
                                    aria-label={`Select ${group.projectId}`}
                                    checked={isSelected}
                                    disabled={disabled}
                                    onCheckedChange={checked => onToggle(group.projectId, checked === true)}
                                />
                            </td>
                            <td className="px-3 py-2 align-top">
                                <div className="text-foreground">{group.ownerName || '-'}</div>
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <span className="font-mono">{group.ownerId || '-'}</span>
                                    {group.ownerSource === 'goods' && (
                                        <span
                                            className="rounded border border-border px-1"
                                            title={
                                                douUnavailable
                                                    ? "The DoU cloud list could not be loaded, so this is the owner the goods service recorded — a different id system from DoU's."
                                                    : "No DoU cloud links to this project, so this is the owner the goods service recorded — a different id system from DoU's."
                                            }
                                        >
                                            goods owner
                                        </span>
                                    )}
                                </div>
                            </td>
                            <CloudCell group={group} />
                            <DouStatusCell group={group} unavailable={douUnavailable} />
                            <td className="whitespace-nowrap px-3 py-2 align-top text-muted-foreground">
                                {group.cloudStage || '-'}
                            </td>
                            {CLOUD_SERVICES.map(service => (
                                <ProductCell key={service} product={group.products[service]} />
                            ))}
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};
