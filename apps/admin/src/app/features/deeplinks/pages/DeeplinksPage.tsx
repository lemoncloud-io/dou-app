/**
 * Deeplinks Page
 *
 * Main page for managing admin deeplinks.
 * Uses tabs to switch between DEV and PROD environments.
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@chatic/ui-kit/components/ui/tabs';

import { CreateDeeplinkDialog, DeeplinkDetailDialog, DeeplinksPageHeader, DeeplinksTable } from '../components';
import { useFirebaseAuth, useDeeplinks, useDeleteDeeplink } from '../hooks';

import type { AdminDeeplink, DeeplinkEnvironment } from '../types';
import type { JSX } from 'react';

/** Content for a single environment tab */
const EnvironmentContent = ({ env }: { env: DeeplinkEnvironment }): JSX.Element => {
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [viewTargetShortCode, setViewTargetShortCode] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AdminDeeplink | null>(null);

    const { isAuthenticated, isLoading: isAuthLoading, error: authError } = useFirebaseAuth(env);
    const { data, isLoading, isFetching, error, refetch } = useDeeplinks(env);
    const { mutateAsync: deleteDeeplink, isPending: isDeleting } = useDeleteDeeplink(env);

    const handleDelete = async () => {
        if (!deleteTarget) return;

        try {
            await deleteDeeplink(deleteTarget.id);
            toast.success('Deeplink deleted successfully');
            setDeleteTarget(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete deeplink';
            toast.error(message);
        }
    };

    // Loading auth state
    if (isAuthLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Skeleton className="h-8 w-32" />
            </div>
        );
    }

    // Auth error state
    if (authError || !isAuthenticated) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                <p className="text-destructive">{authError || 'Authentication failed'}</p>
                <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
        );
    }

    // Data error state
    if (error) {
        return (
            <>
                <DeeplinksPageHeader isFetching={isFetching} onCreateClick={() => setCreateDialogOpen(true)} />
                <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                    <p className="text-destructive">Failed to load deeplinks</p>
                    <Button onClick={() => refetch()}>Retry</Button>
                </div>
            </>
        );
    }

    return (
        <>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    {isFetching && <span className="text-sm text-muted-foreground">Refreshing...</span>}
                </div>
                <Button onClick={() => setCreateDialogOpen(true)}>Create Deeplink</Button>
            </div>

            <CreateDeeplinkDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                onSuccess={() => refetch()}
                env={env}
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

            <DeeplinkDetailDialog
                shortCode={viewTargetShortCode}
                onOpenChange={open => !open && setViewTargetShortCode(null)}
                env={env}
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
        </>
    );
};

export const DeeplinksPage = (): JSX.Element => {
    const [activeEnv, setActiveEnv] = useState<DeeplinkEnvironment>('DEV');

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Deeplinks</h1>

            <Tabs value={activeEnv} onValueChange={value => setActiveEnv(value as DeeplinkEnvironment)}>
                <TabsList className="mb-4">
                    <TabsTrigger value="DEV">Development</TabsTrigger>
                    <TabsTrigger value="PROD">Production</TabsTrigger>
                </TabsList>

                <TabsContent value="DEV">
                    <EnvironmentContent env="DEV" />
                </TabsContent>

                <TabsContent value="PROD">
                    <EnvironmentContent env="PROD" />
                </TabsContent>
            </Tabs>
        </div>
    );
};
