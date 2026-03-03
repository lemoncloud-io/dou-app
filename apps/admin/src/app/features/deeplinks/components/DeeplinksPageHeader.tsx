/**
 * Deeplinks Page Header
 *
 * Reusable header component for the deeplinks page.
 */

import { LogOut, Plus } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';

import type { JSX } from 'react';

interface DeeplinksPageHeaderProps {
    userEmail?: string | null;
    isFetching?: boolean;
    onLogout: () => void;
    onCreateClick?: () => void;
    showCreateButton?: boolean;
}

export const DeeplinksPageHeader = ({
    userEmail,
    isFetching,
    onLogout,
    onCreateClick,
    showCreateButton = false,
}: DeeplinksPageHeaderProps): JSX.Element => {
    return (
        <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">Deeplinks</h1>
            <div className="flex items-center gap-2">
                {isFetching && <span className="text-sm text-muted-foreground">Refreshing...</span>}
                {userEmail && <span className="text-sm text-muted-foreground">{userEmail}</span>}
                {userEmail && (
                    <Button variant="outline" size="sm" onClick={onLogout}>
                        <LogOut className="h-4 w-4 mr-2" />
                        Logout
                    </Button>
                )}
                {showCreateButton && onCreateClick && (
                    <Button onClick={onCreateClick}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Deeplink
                    </Button>
                )}
            </div>
        </div>
    );
};
