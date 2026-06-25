import type { JSX } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { cn } from '@chatic/lib/utils';

import { useOnNavigate } from '../../bridge';
import { useBackHandler } from '../../hooks';

const MAIN_VARIANT_PATHS = ['/'];

const isMainVariant = (pathname: string): boolean =>
    MAIN_VARIANT_PATHS.some(path =>
        path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path + '/')
    );

export const UnifiedLayout = (): JSX.Element => {
    useBackHandler();

    const navigate = useNavigate();
    useOnNavigate(message => {
        const { path, replace } = message.data;
        logger.info('ROUTER', `Received OnNavigate event from native: ${path}`, { replace });
        try {
            navigate(path, { replace: !!replace });
        } catch (error) {
            logger.error('ROUTER', `Failed to navigate to: ${path}`, { error });
        }
    });

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
