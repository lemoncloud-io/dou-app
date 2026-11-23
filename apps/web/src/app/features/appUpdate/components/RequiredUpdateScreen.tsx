import { useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime';
import { Button } from '@chatic/web-ui-kit';

import { bootSplash } from '../../../runtime/bootSplash';

export const RequiredUpdateScreen = () => {
    const { t } = useTranslation();

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
            <Button tone="green" size="lg" fullWidth onClick={() => runtime.appShell.storeUpdate?.openStore()}>
                {t('appUpdate.update')}
            </Button>
        </main>
    );
};
