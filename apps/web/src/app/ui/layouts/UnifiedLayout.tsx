import type { JSX } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';

import { bindGlobalNavigate } from '../../routes/globalNavigate';
import { useBackHandler } from '../hooks/useBackHandler';

const MAIN_VARIANT_PATHS = ['/', '/explore'];

const isMainVariant = (pathname: string): boolean =>
    MAIN_VARIANT_PATHS.some(path =>
        path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path + '/')
    );

export const UnifiedLayout = (): JSX.Element => {
    useBackHandler();
    bindGlobalNavigate(useNavigate());

    const { pathname } = useLocation();
    const isMain = isMainVariant(pathname);

    return (
        <div
            className={cn(
                'flex flex-col w-full bg-background',
                isMain
                    ? 'max-w-[430px] mx-auto min-h-dvh text-foreground relative overflow-x-hidden'
                    : 'h-dvh overflow-hidden'
            )}
            style={{ colorScheme: 'light' }}
        >
            <Outlet />
        </div>
    );
};
