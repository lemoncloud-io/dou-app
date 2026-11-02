import { useEffect, useMemo } from 'react';
import type { IAppBridgeHost } from '@chatic/bridges';

import { subWebViewService } from '../../services';
import { createSubWebViewHandlers, forwardSubWebViewClosed } from './subWebViewHandlers';

export const useSubWebViewHandler = (bridge: IAppBridgeHost) => {
    useEffect(() => forwardSubWebViewClosed(subWebViewService, bridge), [bridge]);
    return useMemo(() => createSubWebViewHandlers(subWebViewService), []);
};
