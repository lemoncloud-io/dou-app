import { Loader2 } from 'lucide-react';

import { cn } from '@chatic/ui-kit';

const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-16 w-16',
    xl: 'h-24 w-24',
};

interface LoaderProps {
    size?: keyof typeof sizes;
    message?: string;
    className?: string;
}

export const Loader: React.FC<LoaderProps> = ({ size = 'sm', message = '', className = '' }) => {
    return (
        <div className={cn('flex items-center space-x-3', className)}>
            <div className="relative">
                <Loader2 className={cn('animate-spin text-orange-500 dark:text-orange-400', sizes[size])} />
                {size !== 'sm' && (
                    <div
                        className={cn(
                            'absolute inset-0 animate-ping text-orange-500/20 dark:text-orange-400/20',
                            sizes[size]
                        )}
                    >
                        <Loader2 className={sizes[size]} />
                    </div>
                )}
            </div>
            {message && <span className="text-sm font-medium text-primary-content animate-pulse">{message}</span>}
        </div>
    );
};
