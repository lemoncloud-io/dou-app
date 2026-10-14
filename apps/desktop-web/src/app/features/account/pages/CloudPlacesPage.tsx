import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { Button } from '@chatic/ui-kit/components/ui/button';

import { runtime } from '@chatic/app-runtime';

import { PageShell, useCloudSessionCatalog, useCloudSwitchFlow, usePlaces } from '../../../shared';

/**
 * One cloud's places. Listing another cloud's places needs its session, and
 * entering one silently would yank the reader out of their cloud — so a
 * foreign cloud shows a switch button instead, and the list appears once the
 * reader's own switch lands them there.
 */
export const CloudPlacesPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { cloudId } = useParams<{ cloudId: string }>();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const { places } = usePlaces();
    const { switchCloud, isSwitching } = useCloudSwitchFlow();

    const isActive = !!cloudId && cloudId === selectedCloudId;
    // The hub names itself dynamically; borrow its name for the back button so
    // back reads as the cloud, falling back to its id while the catalog loads.
    const { clouds } = useCloudSessionCatalog();
    const parentName = clouds.find(row => row.id === cloudId)?.name ?? cloudId ?? '';

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
                    <ul className="flex flex-col gap-1">
                        {places.map(place => (
                            <li key={place.id}>
                                <button
                                    type="button"
                                    onClick={() => place.id && navigate(`/places/${place.id}/settings`)}
                                    className="focus-ring tactile flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
                                >
                                    <span className="min-w-0 flex-1 truncate text-callout font-medium text-foreground">
                                        {place.name ?? place.id}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
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
