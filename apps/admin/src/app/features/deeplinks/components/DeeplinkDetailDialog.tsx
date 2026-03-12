/**
 * Deeplink Detail Dialog
 *
 * Dialog for viewing deeplink details from Firebase.
 * Supports environment-specific data fetching.
 */

import { Loader2 } from 'lucide-react';

import { formatDate } from '@chatic/shared';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@chatic/ui-kit/components/ui/dialog';

import { useDeeplinkDetail } from '../hooks';

import type { DeeplinkEnvironment } from '../types';
import type { JSX } from 'react';

interface DeeplinkDetailDialogProps {
    shortCode: string | null;
    onOpenChange: (open: boolean) => void;
    env: DeeplinkEnvironment;
}

export const DeeplinkDetailDialog = ({ shortCode, onOpenChange, env }: DeeplinkDetailDialogProps): JSX.Element => {
    const { data: deeplink, isLoading, error } = useDeeplinkDetail(env, shortCode);

    return (
        <Dialog open={!!shortCode} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Deeplink Details ({env})</DialogTitle>
                    <DialogDescription>View deeplink information from Firebase</DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                ) : error ? (
                    <div className="py-4 text-center text-destructive">Failed to load deeplink details</div>
                ) : deeplink ? (
                    <div className="space-y-4 min-w-0">
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Deep Link URL</label>
                            <p className="mt-1 font-mono text-sm break-all bg-muted p-2 rounded">
                                {deeplink.deepLinkUrl}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">Created At</label>
                                <p className="mt-1">{formatDate(deeplink.createdAt)}</p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">Created By</label>
                                <p className="mt-1">{deeplink.createdBy}</p>
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Raw Data (JSON)</label>
                            <pre className="mt-1 text-xs bg-muted p-3 rounded overflow-auto max-h-[500px] w-full">
                                {JSON.stringify(deeplink, null, 2)}
                            </pre>
                        </div>
                    </div>
                ) : (
                    <div className="py-4 text-center text-muted-foreground">Deeplink not found</div>
                )}
            </DialogContent>
        </Dialog>
    );
};
