import { type JSX, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { Banner, Button, Dialog, Spinner } from './ui';
import { formatDate, formatMoney } from '../utils';

import type { CardEntryChannel, CardEntryRequest } from '../lib/port/cardEntry';

/**
 * The dialog a card is typed into when the payment provider hands over a card field rather than a
 * window of its own. Mounted once at the route root when the port can ask for one (`PortSetup.cardEntry`).
 * The field is the provider's; around it the dialog states the recurring charge the card agrees to — when,
 * how often, how much, and how to stop it — and the card is registered only once that is ticked.
 *
 * The dialog is not modal: the card's own security check, when it asks for one, opens over the page
 * outside the dialog and has to take clicks, which a modal dialog would block. It looks the same, backdrop
 * included, and while a registration is being confirmed nothing closes it. (Switching modality on the
 * way would remount the dialog's content, and the card field with it.)
 */
export const CardEntryWindow = ({ channel }: { channel: CardEntryChannel }): JSX.Element | null => {
    const request = useSyncExternalStore(channel.subscribe, channel.pending, () => null);
    if (!request) return null;
    // A new request starts a new field, so the dialog's state starts over with it.
    return <CardEntryDialog key={String(requestKey(request))} request={request} channel={channel} />;
};

const keys = new WeakMap<CardEntryRequest, number>();
let nextKey = 0;
const requestKey = (request: CardEntryRequest): number => {
    if (!keys.has(request)) keys.set(request, ++nextKey);
    return keys.get(request) as number;
};

type FieldState = 'loading' | 'ready' | 'unavailable';

const CardEntryDialog = ({
    request,
    channel,
}: {
    request: CardEntryRequest;
    channel: CardEntryChannel;
}): JSX.Element => {
    const onDone = channel.finish;
    const { t, i18n } = useTranslation();
    const field = useRef<HTMLDivElement | null>(null);
    const [state, setState] = useState<FieldState>('loading');
    const [consented, setConsented] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const k = (key: string) => `subscription.common.cardEntry.${key}`;

    // The ref is set once the dialog's portal has rendered the field's box; the field is put in it then.
    const attach = (node: HTMLDivElement | null) => {
        if (!node || field.current) return;
        field.current = node;
        request.mount(node, i18n.language).then(
            () => setState('ready'),
            (error: unknown) => {
                console.warn('card field did not load', error instanceof Error ? error.message : error);
                setState('unavailable');
            }
        );
    };
    // Gone for good — the reader left the account surface — the field is taken away and the request ends
    // as a closed window, so its caller is not left waiting. Checked a moment later, because a development
    // build unmounts and mounts every effect once on purpose.
    const alive = useRef(false);
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            queueMicrotask(() => {
                if (alive.current) return;
                request.unmount();
                if (channel.pending() === request) channel.finish('closed');
            });
        };
    }, [request, channel]);
    // Another page within the account surface: the dialog belongs to the one that opened it.
    const { pathname } = useLocation();
    const openedOn = useRef(pathname);
    useEffect(() => {
        if (pathname !== openedOn.current && channel.pending() === request) channel.finish('closed');
    }, [pathname, request, channel]);

    const close = () => {
        if (!confirming) onDone('closed');
    };

    const submit = async () => {
        setConfirming(true);
        const confirmation = await request.confirm();
        setConfirming(false);
        if (confirmation.outcome !== 'retry') onDone(confirmation.outcome);
    };

    const { amount, firstChargeAt, withTrial } = request.terms;
    const price = amount && formatMoney(amount, i18n.language);
    const charge =
        price && firstChargeAt
            ? withTrial
                ? t(k('terms.trial'), {
                      date: formatDate(firstChargeAt),
                      day: Number(firstChargeAt.slice(8, 10)),
                      price,
                  })
                : t(k('terms.paid'), { day: Number(firstChargeAt.slice(8, 10)), price })
            : t(k('terms.card'));

    return (
        <Dialog
            open
            modal={false}
            onOpenChange={open => !open && close()}
            title={t(k('title'))}
            description={t(k('description'))}
            className="max-w-[520px]"
            footer={
                <>
                    <Button variant="secondary" size="lg" disabled={confirming} onClick={close}>
                        {t('subscription.common.actions.cancel')}
                    </Button>
                    <Button
                        size="lg"
                        disabled={state !== 'ready' || !consented || confirming}
                        onClick={() => void submit()}
                    >
                        {confirming ? <Spinner /> : t(k('submit'))}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                {state === 'unavailable' ? (
                    <Banner tone="danger" title={t(k('unavailable.title'))}>
                        {t(k('unavailable.body'))}
                    </Banner>
                ) : (
                    <div className="relative min-h-[120px]">
                        {state === 'loading' && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Spinner />
                            </div>
                        )}
                        <div ref={attach} data-testid="card-entry-field" />
                    </div>
                )}
                <div className="flex flex-col gap-2 rounded-xl bg-note px-4 py-3 text-[13px] font-medium leading-[1.6] text-[#666b78]">
                    <p>{charge}</p>
                    <p>{t(k('terms.cancel'))}</p>
                </div>
                <label className="flex items-start gap-2 text-sm font-medium leading-normal text-ink">
                    <input
                        type="checkbox"
                        className="checkbox-lime mt-0.5"
                        checked={consented}
                        disabled={confirming}
                        onChange={event => setConsented(event.target.checked)}
                    />
                    {t(k('consent'))}
                </label>
            </div>
        </Dialog>
    );
};
