import { Logo } from '@chatic/assets';

interface LoadingFallbackProps {
    message?: string;
}

export const LoadingFallback: React.FC<LoadingFallbackProps> = ({ message = '' }) => {
    return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center">
            {/* Logo with pulse animation */}
            <div className="animate-pulse">
                <img src={Logo.logo} alt="DoU" className="w-24 h-24 object-contain" />
            </div>

            {/* Loading indicator */}
            <div className="mt-8 flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce" />
            </div>

            {/* Optional message */}
            {message && <div className="mt-4 text-sm text-muted-foreground text-center">{message}</div>}
        </div>
    );
};
