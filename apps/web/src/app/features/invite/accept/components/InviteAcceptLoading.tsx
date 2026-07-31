import type { JSX } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Text } from '@chatic/web-ui-kit';

import { InviteGlassSurface } from './InviteGlassSurface';

/**
 * "We have the link, not the invitation yet." Shown while the entry read is still out — either the
 * background guest login has not finished (an invite deeplink routinely arrives mid-boot) or
 * `invite.get` is in flight.
 *
 * Wearing the accept screen's own surface rather than a neutral spinner matters here: this is the
 * very first thing an invited person ever sees of the app, and it used to be a blank white page.
 */
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
