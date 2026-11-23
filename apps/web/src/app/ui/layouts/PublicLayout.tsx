import { Outlet } from 'react-router-dom';

export const PublicLayout = () => {
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
