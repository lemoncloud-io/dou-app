import type { CloudView } from '@lemoncloud/chatic-backend-api';

export const cloudDisplayName = (cloud: Pick<CloudView, 'name' | 'email'>): string =>
    cloud.name ?? cloud.email?.split('@')[0] ?? '';
