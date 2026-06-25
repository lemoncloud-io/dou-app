import { Outlet } from 'react-router-dom';

/**
 * Public layout component for unauthenticated pages
 * Provides responsive design container
 */
export const PublicLayout = (): JSX.Element => {
    return (
        <div className="h-screen flex flex-col overflow-hidden bg-background">
            <div className="flex-1 flex flex-col overflow-auto">
                <div className="flex-1">
                    <Outlet />
                </div>
            </div>
        </div>
    );
};
