import { useLayoutEffect, useState } from 'react';

import { useToastLift } from '@chatic/ui-kit/components/ui/toaster';

const rootVar = (name: string): number =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;

export const useBottomChromeToastLift = (height: number | null) => {
    const [inset, setInset] = useState(0);
    useLayoutEffect(() => {
        setInset(Math.max(rootVar('--safe-bottom'), rootVar('--keyboard-height')));
    }, [height]);

    useToastLift(height ? Math.max(0, height - inset) : null);
};
