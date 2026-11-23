import * as i18next from 'i18next';

import { logger } from '@chatic/bridges';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

export const onDuplicateKey = (key: string): void => {
    logger.error('CONFIG', `Duplicate config key declared twice: ${key}`);
};

export const onShellWriteFailed = (key: string, error: unknown): void => {
    logger.error('CONFIG', `Shell write failed after retry: ${key}`, error as Error);
    toast({
        variant: 'destructive',
        title: i18next.t('settings.saveFailedTitle'),
        description: i18next.t('settings.saveFailedDescription', { key }),
    });
};
