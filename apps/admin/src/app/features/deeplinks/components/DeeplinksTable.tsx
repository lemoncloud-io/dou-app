/**
 * Deeplinks Table
 *
 * Table component for displaying and managing deeplinks.
 */

import { Copy, ExternalLink, Eye, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import copy from 'copy-to-clipboard';

import { formatDate } from '@chatic/shared';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Skeleton } from '@chatic/ui-kit/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@chatic/ui-kit/components/ui/table';

import type { AdminDeeplink } from '../types';
import type { JSX } from 'react';

interface DeeplinksTableProps {
    deeplinks: AdminDeeplink[];
    isLoading?: boolean;
    onView: (deeplink: AdminDeeplink) => void;
    onDelete: (deeplink: AdminDeeplink) => void;
}

const TableSkeleton = (): JSX.Element => (
    <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
                <TableCell>
                    <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                    <Skeleton className="h-4 w-48" />
                </TableCell>
                <TableCell>
                    <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                    <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                    <Skeleton className="h-4 w-24" />
                </TableCell>
            </TableRow>
        ))}
    </TableBody>
);

export const DeeplinksTable = ({ deeplinks, isLoading, onView, onDelete }: DeeplinksTableProps): JSX.Element => {
    const handleCopyUrl = (url: string) => {
        const success = copy(url);
        if (success) {
            toast.success('URL copied to clipboard');
        } else {
            toast.error('Failed to copy URL');
        }
    };

    const handleOpenUrl = (url: string) => {
        window.open(url, '_blank');
    };

    return (
        <div className="border rounded-lg">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Deep Link URL</TableHead>
                        <TableHead>Created At</TableHead>
                        <TableHead>Created By</TableHead>
                        <TableHead>Actions</TableHead>
                    </TableRow>
                </TableHeader>
                {isLoading ? (
                    <TableSkeleton />
                ) : (
                    <TableBody>
                        {!deeplinks.length ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground">
                                    No deeplinks found. Create one to get started.
                                </TableCell>
                            </TableRow>
                        ) : (
                            deeplinks.map(deeplink => (
                                <TableRow key={deeplink.id}>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{deeplink.user.name}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {deeplink.user.loginId || deeplink.user.id}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <code className="text-sm bg-muted px-2 py-1 rounded">
                                            {deeplink.deepLinkUrl}
                                        </code>
                                    </TableCell>
                                    <TableCell>{formatDate(deeplink.createdAt)}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {deeplink.createdBy}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => onView(deeplink)}
                                                title="View Details"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleCopyUrl(deeplink.deepLinkUrl)}
                                                title="Copy URL"
                                            >
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleOpenUrl(deeplink.deepLinkUrl)}
                                                title="Open URL"
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => onDelete(deeplink)}
                                                title="Delete"
                                                className="text-destructive hover:text-destructive"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                )}
            </Table>
        </div>
    );
};
