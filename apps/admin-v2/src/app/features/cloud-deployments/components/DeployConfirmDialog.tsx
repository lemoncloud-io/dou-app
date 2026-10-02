/**
 * `components/cloud-deployments/DeployConfirmDialog.tsx`
 * - The last look before a run: which goods service, how many clouds and products, which branches.
 *
 * Shaped after the membership override confirmation. The target is named here as well as in the
 * header because admin-v2 is not deployed — it calls whatever the operator's own `.env` resolves to.
 */
import { Badge } from '@chatic/ui-kit/components/ui/badge';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';

import { CLOUD_SERVICES, type CloudService } from '../lib/cloudGroups';
import { DEFAULT_BRANCH, normalizeBranch } from '../lib/deployPlan';
import { DEPLOY_INTERVAL_MS } from '../lib/runDeploys';

import type { GoodsTarget } from '../lib/goodsTarget';
import type { JSX } from 'react';

interface DeployConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    target: GoodsTarget;
    cloudCount: number;
    productCount: number;
    services: ReadonlySet<CloudService>;
    branches: Partial<Record<CloudService, string>>;
    force: boolean;
    onConfirm: () => void;
}

export const DeployConfirmDialog = ({
    open,
    onOpenChange,
    target,
    cloudCount,
    productCount,
    services,
    branches,
    force,
    onConfirm,
}: DeployConfirmDialogProps): JSX.Element => (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>
                    Deploy {productCount} product{productCount === 1 ? '' : 's'} to {cloudCount} subscription cloud
                    {cloudCount === 1 ? '' : 's'}?
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                    <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs">Goods service</span>
                            <Badge variant={target.isProd ? 'destructive' : 'outline'}>{target.label}</Badge>
                            <span className="font-mono text-xs text-muted-foreground">{target.endpoint}</span>
                        </div>
                        <ul className="list-disc space-y-1 pl-4 text-sm">
                            {CLOUD_SERVICES.filter(service => services.has(service)).map(service => (
                                <li key={service}>
                                    {service}:{' '}
                                    {normalizeBranch(branches[service]) ?? `catalog branch, else ${DEFAULT_BRANCH}`}
                                </li>
                            ))}
                            <li>force: {force ? 'on — products still marked busy are deployed again' : 'off'}</li>
                        </ul>
                        <p className="text-xs">
                            Calls go out one at a time, {DEPLOY_INTERVAL_MS / 1000} seconds apart. Stop prevents the
                            next call; the one in flight still finishes.
                        </p>
                    </div>
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onConfirm}>Deploy</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
);
