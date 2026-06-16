/**
 * Deeplinks Page
 *
 * Main page for managing admin deeplinks.
 * Environment is determined by deployment (VITE_ENV).
 * Uses anonymous Firebase authentication.
 */

import { useState } from 'react';

import { toast } from 'sonner';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Skeleton } from '@chatic/ui-kit/components/ui/skeleton';
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

import { reportError, toError } from '@chatic/web-core';

import { CreateDeeplinkDialog, DeeplinkDetailDialog, DeeplinksTable } from '../components';
import { useFirebaseAuth, useDeeplinks, useDeleteDeeplink, useDeleteAllDeeplinks } from '../hooks';

import type { AdminDeeplink } from '../types';
import type { JSX } from 'react';

const ENV_LABEL = import.meta.env.VITE_ENV === 'PROD' ? 'Production' : 'Development';

export const DeeplinksPage = (): JSX.Element => {
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [viewTargetShortCode, setViewTargetShortCode] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AdminDeeplink | null>(null);
    const [deleteAllOpen, setDeleteAllOpen] = useState(false);

    const { isAuthenticated, isLoading: isAuthLoading, error: authError } = useFirebaseAuth();
    const { data, isLoading, isFetching, error, refetch } = useDeeplinks();
    const { mutateAsync: deleteDeeplink, isPending: isDeleting } = useDeleteDeeplink();
    const { mutateAsync: deleteAllDeeplinks, isPending: isDeletingAll } = useDeleteAllDeeplinks();

    const handleDelete = async () => {
        if (!deleteTarget) return;

        try {
            await deleteDeeplink(deleteTarget.id);
            toast.success('Deeplink deleted successfully');
            setDeleteTarget(null);
        } catch (err) {
            reportError(toError(err));
            const message = err instanceof Error ? err.message : 'Failed to delete deeplink';
            toast.error(message);
        }
    };

    const handleDeleteAll = async () => {
        try {
            const count = await deleteAllDeeplinks();
            toast.success(`${count} deeplinks deleted successfully`);
            setDeleteAllOpen(false);
        } catch (err) {
            reportError(toError(err));
            const message = err instanceof Error ? err.message : 'Failed to delete deeplinks';
            toast.error(message);
        }
    };

    if (isAuthLoading) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold mb-4">Deeplinks</h1>
                <div className="flex items-center justify-center min-h-[400px]">
                    <Skeleton className="h-8 w-32" />
                </div>
            </div>
        );
    }

    if (authError || !isAuthenticated) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold mb-4">Deeplinks</h1>
                <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                    <p className="text-destructive">{authError || 'Authentication failed'}</p>
                    <Button onClick={() => window.location.reload()}>Retry</Button>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold mb-4">Deeplinks</h1>
                <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                    <p className="text-destructive">Failed to load deeplinks</p>
                    <Button onClick={() => refetch()}>Retry</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold">Deeplinks</h1>
                    <span className="text-sm text-muted-foreground px-2 py-1 bg-muted rounded">{ENV_LABEL}</span>
                </div>
                <div className="flex items-center gap-2">
                    {isFetching && <span className="text-sm text-muted-foreground">Refreshing...</span>}
                    <Button
                        variant="destructive"
                        onClick={() => setDeleteAllOpen(true)}
                        disabled={!data?.total || isDeletingAll}
                    >
                        {isDeletingAll ? 'Deleting...' : 'Delete All'}
                    </Button>
                    <Button onClick={() => setCreateDialogOpen(true)}>Create Deeplink</Button>
                </div>
            </div>

            <CreateDeeplinkDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                onSuccess={() => refetch()}
            />

            <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Deeplink</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete the deeplink for "{deleteTarget?.displayName}"? This action
                            cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete All Deeplinks</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete all {data?.total ?? 0} deeplinks? This action cannot be
                            undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteAll} disabled={isDeletingAll}>
                            {isDeletingAll ? 'Deleting...' : `Delete All (${data?.total ?? 0})`}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <DeeplinkDetailDialog
                shortCode={viewTargetShortCode}
                onOpenChange={open => !open && setViewTargetShortCode(null)}
            />

            <DeeplinksTable
                deeplinks={data?.list ?? []}
                isLoading={isLoading}
                onView={deeplink => setViewTargetShortCode(deeplink.id)}
                onDelete={setDeleteTarget}
            />

            {data?.total && data.total > 20 && (
                <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                        Showing {data.list.length} of {data.total} deeplinks
                    </div>
                </div>
            )}
        </div>
    );
};
