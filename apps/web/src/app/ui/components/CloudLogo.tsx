import { useState } from 'react';

import { Logo } from '@chatic/assets';

export const CloudLogo = () => {
    const [isAnimating, setIsAnimating] = useState(false);

    return (
        <div className="flex items-center gap-1.5">
            <button
                type="button"
                onClick={() => !isAnimating && setIsAnimating(true)}
                className="select-none focus:outline-none"
                aria-label="DoU cloud"
            >
                <img
                    src={Logo.logo}
                    alt="DoU"
                    className={`h-7 w-7 ${isAnimating ? 'animate-cloud-bounce' : ''}`}
                    onAnimationEnd={() => setIsAnimating(false)}
                />
            </button>
            <img src={Logo.douBk} alt="D.U" className="h-4 dark:hidden" />
            <img src={Logo.douGr} alt="D.U" className="hidden h-4 dark:block" />
        </div>
    );
};
