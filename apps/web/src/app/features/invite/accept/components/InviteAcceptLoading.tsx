import type { JSX } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Text } from '@chatic/web-ui-kit';

import { InviteGlassSurface } from './InviteGlassSurface';

export const InviteAcceptLoading = (): JSX.Element => {
    const { t } = useTranslation();

    return (
        <InviteGlassSurface>
            <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3">
                <Loader2 size={28} className="animate-spin text-foreground" />
                <Text as="p" className="text-[15px] font-medium text-description">
                    {t('inviteAccept.loading')}
                </Text>
            </div>
        </InviteGlassSurface>
    );
};
