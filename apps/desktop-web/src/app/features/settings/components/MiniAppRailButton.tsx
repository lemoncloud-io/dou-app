import { LayoutGrid } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { RailTile } from '../../../shared';
import { isPreProductionBuild, useMiniAppLauncher, useSubWebViewOpenScope } from '../hooks/useMiniAppLauncher';
import { MiniAppDialogs } from './MiniAppDialogs';

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
