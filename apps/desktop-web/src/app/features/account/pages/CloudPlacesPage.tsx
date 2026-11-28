import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { Button } from '@chatic/ui-kit';

import { runtime } from '@chatic/runtime-react';
import { SettingsNavRow, SettingsRowGroup } from '@chatic/design-system-components-desktop';

import { PageShell, useCloudSessionCatalog, useCloudSwitchFlow, usePlaces } from '../../../shared';

export const CloudPlacesPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { cloudId } = useParams<{ cloudId: string }>();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const { places } = usePlaces();
    const { switchCloud, isSwitching } = useCloudSwitchFlow();

    const isActive = !!cloudId && cloudId === selectedCloudId;
    const { clouds } = useCloudSessionCatalog();
    const parentName = useMemo(() => clouds.find(row => row.id === cloudId)?.name ?? cloudId ?? '', [clouds, cloudId]);

    return (
        <PageShell
            title={t('cloud.places.title')}
            backTo={`/account/clouds/${cloudId}`}
            backLabel={parentName}
            contentClassName="flex flex-col"
        >
            {isActive ? (
                places.length === 0 ? (
                    <p className="m-auto px-6 py-8 text-center text-caption text-muted-foreground">
                        {t('cloud.places.empty')}
                    </p>
                ) : (
                    <SettingsRowGroup>
                        {places.map(place => (
                            <SettingsNavRow
                                key={place.id}
                                label={place.name ?? place.id ?? ''}
                                onClick={() => place.id && navigate(`/places/${place.id}/settings`)}
                            />
                        ))}
                    </SettingsRowGroup>
                )
            ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
                    <p className="max-w-xs text-callout text-muted-foreground">{t('cloud.places.switchHint')}</p>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={isSwitching || !cloudId}
                        onClick={() => cloudId && void switchCloud(cloudId)}
                    >
                        {isSwitching ? t('cloud.places.switching') : t('cloud.places.switch')}
                    </Button>
                </div>
            )}
        </PageShell>
    );
};
