import { LayoutGrid } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { RailTile } from '../../../shared';
import { isPreProductionBuild, useMiniAppLauncher, useSubWebViewOpenScope } from '../hooks/useMiniAppLauncher';
import { MiniAppDialogs } from './MiniAppDialogs';

/**
 * The nav rail's mini app tile, under DM. It opens the cloud's link, or the hub when there is none,
 * exactly like the settings row — same launcher, same consent and owner dialogs — and shows under the
 * same conditions: a shell that opens any https page, a pre-production build, and a cloud other than
 * the Default Cloud. It is an action, not a destination: the sidebar does not change.
 */
export const MiniAppRailButton = () => {
    const scope = useSubWebViewOpenScope();
    return scope === 'anyHttps' && isPreProductionBuild() ? <MiniAppRailTile /> : null;
};

const MiniAppRailTile = () => {
    const { t } = useTranslation();
    const launcher = useMiniAppLauncher();
    if (!launcher.available) {
        return null;
    }
    return (
        <>
            <RailTile label={t('nav.miniApp')} onClick={() => void launcher.open()}>
                <LayoutGrid size={20} strokeWidth={2} aria-hidden />
            </RailTile>
            <MiniAppDialogs launcher={launcher} />
        </>
    );
};
