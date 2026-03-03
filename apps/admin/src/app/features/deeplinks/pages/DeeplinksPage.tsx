/**
 * Deeplinks Page
 *
 * Main page for managing admin deeplinks.
 * Requires Firebase authentication.
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

import {
    FirebaseLoginDialog,
    CreateDeeplinkDialog,
    DeeplinkDetailDialog,
    DeeplinksPageHeader,
    DeeplinksTable,
} from '../components';
import { useFirebaseAuth, useDeeplinks, useDeleteDeeplink } from '../hooks';

import type { AdminDeeplink } from '../types';
import type { JSX } from 'react';

export const DeeplinksPage = (): JSX.Element => {
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [viewTargetUserId, setViewTargetUserId] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AdminDeeplink | null>(null);

    const { isAuthenticated, isLoading: isAuthLoading, user, signIn, signOut, error: authError } = useFirebaseAuth();
    const { data, isLoading, isFetching, error, refetch } = useDeeplinks();
    const { mutateAsync: deleteDeeplink, isPending: isDeleting } = useDeleteDeeplink();

    const handleLogin = async (email: string, password: string) => {
        await signIn(email, password);
    };

    const handleLogout = async () => {
        try {
            await signOut();
            toast.success('Logged out successfully');
        } catch {
            toast.error('Failed to logout');
        }
    };

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

    // Show login dialog if not authenticated
    if (!isAuthenticated && !isAuthLoading) {
        return (
            <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-bold">Deeplinks</h1>
                </div>
                <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                    <p className="text-muted-foreground">Please sign in to Firebase to manage deeplinks</p>
                    <FirebaseLoginDialog
                        open={true}
                        onOpenChange={() => undefined}
                        onLogin={handleLogin}
                        error={authError}
                    />
                </div>
            </div>
        );
    }

    // Loading auth state
    if (isAuthLoading) {
        return (
            <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-bold">Deeplinks</h1>
                </div>
                <div className="flex items-center justify-center min-h-[400px]">
                    <Skeleton className="h-8 w-32" />
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="p-6">
                <DeeplinksPageHeader userEmail={user?.email} onLogout={handleLogout} />
                <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                    <p className="text-destructive">Failed to load deeplinks</p>
                    <Button onClick={() => refetch()}>Retry</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <DeeplinksPageHeader
                userEmail={user?.email}
                isFetching={isFetching}
                onLogout={handleLogout}
                onCreateClick={() => setCreateDialogOpen(true)}
                showCreateButton
            />

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
                            Are you sure you want to delete the deeplink for user "{deleteTarget?.user.name}"? This
                            action cannot be undone.
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

            <DeeplinkDetailDialog userId={viewTargetUserId} onOpenChange={open => !open && setViewTargetUserId(null)} />

            <DeeplinksTable
                deeplinks={data?.list ?? []}
                isLoading={isLoading}
                onView={deeplink => setViewTargetUserId(deeplink.user.id)}
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
