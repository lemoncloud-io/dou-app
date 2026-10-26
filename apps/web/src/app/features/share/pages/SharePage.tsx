import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { IconSpinner, ModalTopBar, PickedFileStrip } from '@chatic/web-ui-kit';
import type { ShellFileRef } from '@chatic/data';

import { releaseShareIntake } from '../../../bridge/shareIntake';
import { ROUTES } from '../../../routes/paths';
import { useShareIntake } from '../hooks/useShareIntake';

/**
 * Where another app's share lands: `/share?id=`, opened by the app on the URL its share extension
 * (iOS) or share intent (Android) wrote. What was shared already sits in the app's own folder; this
 * page asks for it by id, and the person decides where it goes.
 */
export const SharePage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const id = params.get('id');
    const state = useShareIntake(id);

    // The person may drop items before sending; the share itself stays as the app gave it.
    const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());

    const leave = () => navigate(ROUTES.home, { replace: true });

    useEffect(() => {
        if (state.status !== 'empty') return;
        // An id-less URL is someone typing the address; only a share that went missing is worth saying.
        if (id) toast({ title: t('share.nothingToShare') });
        navigate(ROUTES.home, { replace: true });
    }, [state.status, id, navigate, toast, t]);

    const close = () => {
        if (id) void releaseShareIntake(id, { discard: true });
        leave();
    };

    const items: ShellFileRef[] =
        state.status === 'ready' ? state.intake.items.filter(item => !removed.has(item.uri)) : [];
    const refused = state.status === 'ready' ? state.intake.refused : [];
    const text = state.status === 'ready' ? state.intake.text : undefined;

    return (
        <div className="flex h-full flex-col bg-background">
            <ModalTopBar title={t('share.title')} onClose={close} closeLabel={t('share.close')} divider />

            {state.status === 'loading' && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-description" role="status">
                    <IconSpinner className="size-6 animate-spin" />
                    <p className="text-[14px]">{t('share.preparing')}</p>
                </div>
            )}

            {state.status === 'error' && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                    <p className="text-[15px] text-foreground">{t('share.loadFailed')}</p>
                    <button
                        type="button"
                        onClick={state.retry}
                        disabled={state.retrying}
                        className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-[14px] font-medium text-foreground disabled:opacity-60"
                    >
                        {state.retrying && <IconSpinner className="size-4 animate-spin" />}
                        {t('share.retry')}
                    </button>
                </div>
            )}

            {state.status === 'ready' && (
                <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-[calc(var(--safe-bottom,0px)+1rem)] pt-4">
                    {text && (
                        <p className="whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-3 text-[15px] text-foreground">
                            {text}
                        </p>
                    )}
                    <PickedFileStrip
                        files={items.map(item => ({ id: item.uri, name: item.name, size: item.size }))}
                        onRemove={uri => setRemoved(prev => new Set(prev).add(uri))}
                        removeLabel={name => t('chat.attach.removeFile', { name })}
                        label={t('share.title')}
                    />
                    {refused.length > 0 && (
                        <p className="text-[13px] text-description">
                            {t('share.notSent', { names: refused.map(item => item.name).join(', ') })}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};
