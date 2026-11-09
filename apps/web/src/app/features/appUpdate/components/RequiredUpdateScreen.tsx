import { useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@chatic/web-ui-kit';

import { appBridge } from '../../../bridge';
import { bootSplash } from '../../../runtime/bootSplash';

/**
 * The whole screen, for a phone app older than the floor: what happened and the way to the store,
 * nothing else. There is no way past it — the rest of the web assumes a shell at the floor or above.
 */
export const RequiredUpdateScreen = () => {
    const { t } = useTranslation();

    // This is the first screen such an app ever reaches, so it is what lifts the boot cover.
    useLayoutEffect(() => {
        bootSplash.release('first-screen');
    }, []);

    return (
        <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center">
            <div className="flex flex-col gap-2">
                <h1 className="text-[20px] font-semibold leading-[1.4] text-foreground">
                    {t('appUpdate.required.title')}
                </h1>
                <p className="whitespace-pre-line text-[15px] leading-[1.5] text-muted-foreground">
                    {t('appUpdate.required.description')}
                </p>
            </div>
            <Button tone="green" size="lg" fullWidth onClick={() => appBridge.openStore()}>
                {t('appUpdate.update')}
            </Button>
        </main>
    );
};
