import { useEffect, useState } from 'react';

import { DisplayRegionBridge, type DivisionRect } from '../../bridge/DisplayRegionBridge';

/** The device fold as UIKit reports it, in window points — `null` while the display is flat or has no fold. */
export const useDivision = (): DivisionRect | null => {
    const [division, setDivision] = useState<DivisionRect | null>(null);
    useEffect(() => DisplayRegionBridge.subscribeDivision(setDivision), []);
    return division;
};
