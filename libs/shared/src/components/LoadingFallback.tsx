import { Logo } from '@chatic/assets';

interface LoadingFallbackProps {
    message?: string;
}

export const LoadingFallback: React.FC<LoadingFallbackProps> = ({ message = '' }) => {
    return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center">
            <img src={Logo.logo} alt="DoU" className="w-24 h-24 object-contain" />
            {message && <div className="mt-4 text-sm text-muted-foreground text-center">{message}</div>}
        </div>
    );
};
