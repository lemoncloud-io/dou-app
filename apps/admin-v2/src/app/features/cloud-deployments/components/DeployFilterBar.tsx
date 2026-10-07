/**
 * `components/cloud-deployments/DeployFilterBar.tsx`
 * - The cloud stage filter, the services to deploy with a branch each, and `force`.
 */
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Checkbox } from '@chatic/ui-kit/components/ui/checkbox';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { Switch } from '@chatic/ui-kit/components/ui/switch';

import { CLOUD_SERVICES, type CloudService } from '../lib/cloudGroups';
import { CLOUD_STAGE_FILTERS, DEFAULT_BRANCH, type CloudStageFilter } from '../lib/deployPlan';

import type { JSX } from 'react';

interface DeployFilterBarProps {
    stageFilter: CloudStageFilter;
    onStageFilterChange: (filter: CloudStageFilter) => void;
    services: ReadonlySet<CloudService>;
    onToggleService: (service: CloudService, on: boolean) => void;
    branches: Partial<Record<CloudService, string>>;
    onBranchChange: (service: CloudService, branch: string) => void;
    force: boolean;
    onForceChange: (force: boolean) => void;
}

const STAGE_FILTER_LABEL: Record<CloudStageFilter, string> = { all: 'All', dev: 'dev', prod: 'prod' };

export const DeployFilterBar = ({
    stageFilter,
    onStageFilterChange,
    services,
    onToggleService,
    branches,
    onBranchChange,
    force,
    onForceChange,
}: DeployFilterBarProps): JSX.Element => (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Cloud stage</span>
            {CLOUD_STAGE_FILTERS.map(filter => (
                <Button
                    key={filter}
                    size="sm"
                    className="h-7"
                    variant={stageFilter === filter ? 'default' : 'outline'}
                    // Without this the active filter is conveyed by background colour alone.
                    aria-pressed={stageFilter === filter}
                    onClick={() => onStageFilterChange(filter)}
                >
                    {STAGE_FILTER_LABEL[filter]}
                </Button>
            ))}
        </div>

        {CLOUD_SERVICES.map(service => {
            const id = `deploy-service-${service}`;
            return (
                <div key={service} className="flex items-center gap-1.5">
                    <Checkbox
                        id={id}
                        checked={services.has(service)}
                        onCheckedChange={checked => onToggleService(service, checked === true)}
                    />
                    <Label htmlFor={id} className="text-xs">
                        {service}
                    </Label>
                    <Input
                        aria-label={`${service} branch`}
                        className="h-7 w-44 px-2 py-0 text-xs"
                        placeholder={`branch (default: ${DEFAULT_BRANCH})`}
                        title={`Blank deploys the service catalog's branch, or ${DEFAULT_BRANCH} if it names none.`}
                        disabled={!services.has(service)}
                        value={branches[service] ?? ''}
                        onChange={event => onBranchChange(service, event.target.value)}
                    />
                </div>
            );
        })}

        <div className="flex items-center gap-1.5">
            <Switch id="deploy-force" checked={force} onCheckedChange={onForceChange} />
            <Label
                htmlFor="deploy-force"
                className="text-xs"
                title="Deploys a product even while it is still marked busy, which can overlap a deploy in progress."
            >
                force
            </Label>
        </div>
    </div>
);
