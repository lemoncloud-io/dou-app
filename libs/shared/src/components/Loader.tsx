import { Loader2 } from 'lucide-react';

import { cn } from '@lemon/ui-kit';

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
                <Loader2 className={cn('animate-spin text-chatic-primary', sizes[size])} />
                {size !== 'sm' && (
                    <div className={cn('absolute inset-0 animate-ping text-chatic-primary/20', sizes[size])}>
                        <Loader2 className={sizes[size]} />
                    </div>
                )}
            </div>
            {message && (
                <span className="text-chatic-sm font-chatic font-medium text-chatic-text-primary animate-pulse">
                    {message}
                </span>
            )}
        </div>
    );
};
