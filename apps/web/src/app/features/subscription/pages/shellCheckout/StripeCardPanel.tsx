import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@chatic/web-ui-kit';

import type { CardEntryChannel, CardEntryRequest } from '@chatic/web-checkout';

export const StripeCardPanel = ({ channel, request }: { channel: CardEntryChannel; request: CardEntryRequest }) => {
    const { t, i18n } = useTranslation();
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);

    const mountInto = (node: HTMLDivElement | null) => {
        if (!node) return;
        request.mount(node, i18n.language).catch(() => setFailed(true));
        return () => request.unmount();
    };

    const confirm = async () => {
        setBusy(true);
        const answer = await request.confirm();
        setBusy(false);
        if (answer.outcome === 'retry') return;
        channel.finish(answer.outcome);
    };

    return (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-end bg-black/40">
            <div className="flex w-full flex-col gap-3 rounded-t-2xl bg-background p-5">
                <div ref={mountInto} />
                {failed && (
                    <p role="alert" className="text-[14px] text-destructive">
                        {t('mypage.subscription.shellCheckout.cardFieldFailed')}
                    </p>
                )}
                <Button tone="green" fullWidth loading={busy} onClick={() => void confirm()}>
                    {t('mypage.subscription.shellCheckout.registerCard')}
                </Button>
                <Button variant="ghost" fullWidth onClick={() => channel.finish('closed')}>
                    {t('common.cancel')}
                </Button>
            </div>
        </div>
    );
};
