import { ChevronLeft } from 'lucide-react';

import { useNavigateWithTransition } from '@chatic/page-transition';

import type { ReactNode } from 'react';

interface PageHeaderProps {
    title: string;
    onBack?: () => void;
    rightAction?: ReactNode;
}

export const PageHeader = ({ title, onBack, rightAction }: PageHeaderProps) => {
    const navigate = useNavigateWithTransition();

    const handleBack = () => {
        if (onBack) {
            onBack();
        } else {
            navigate(-1);
        }
    };

    return (
        <header className="flex items-center justify-center px-4 py-3">
            <button onClick={handleBack} className="absolute left-4 p-2" aria-label="Back">
                <ChevronLeft size={24} strokeWidth={2} className="text-foreground" />
            </button>
            <h1 className="text-[17px] font-semibold text-foreground">{title}</h1>
            {rightAction && <div className="absolute right-4">{rightAction}</div>}
        </header>
    );
};
