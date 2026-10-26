import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    IconChevronRight,
    IconClose,
    IconSend,
    IconSpinner,
    ListRow,
    ModalTopBar,
    PickedFileStrip,
} from '@chatic/web-ui-kit';
import { IMAGE_MESSAGE_SLOT_MAX, judgeChatAttachments, type ShellFileRef } from '@chatic/data';

import { releaseShareIntake } from '../../../bridge/shareIntake';
import { ROUTES } from '../../../routes/paths';
import { DestinationPicker } from '../components/DestinationPicker';
import { DestinationSender } from '../components/DestinationSender';
import { ShareOptionSheet } from '../components/ShareOptionSheet';
import { useShareCloud } from '../hooks/useShareCloud';
import { useShareDestinations } from '../hooks/useShareDestinations';
import { useShareIntake } from '../hooks/useShareIntake';
import { useShareSend } from '../hooks/useShareSend';

/** How many rooms one share goes to — each one is its own upload of every file. */
export const SHARE_DESTINATION_MAX = 5;

const ICON_ACTION = 'flex size-11 items-center justify-center text-foreground disabled:text-placeholder';

/**
 * Where another app's share lands: `/share?id=`, opened by the app on the URL its share extension
 * (iOS) or share intent (Android) wrote. What was shared already sits in the app's own folder; this
 * page asks for it by id, and the person picks the cloud, the place and up to five of its rooms, adds
 * a message if they like, and sends.
 */
export const SharePage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const id = params.get('id');
    // The "To" list is a history entry of its own, so the system back closes it like Cancel does.
    const picking = params.get('to') === '1';
    const state = useShareIntake(id);
    const cloud = useShareCloud();
    const { destinations, isLoading: isDestinationsLoading } = useShareDestinations();
    const { register, send, isSending } = useShareSend(id);

    // The person may drop items before sending; the share itself stays as the app gave it.
    const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [message, setMessage] = useState('');
    const [sheet, setSheet] = useState<'cloud' | 'place' | null>(null);

    useEffect(() => {
        if (state.status !== 'empty') return;
        // An id-less URL is someone typing the address; only a share that went missing is worth saying.
        if (id) toast({ title: t('share.nothingToShare') });
        navigate(ROUTES.home, { replace: true });
    }, [state.status, id, navigate, toast, t]);

    // Rooms belong to one cloud and place: a switch that went through leaves none of the picks valid.
    // One that failed leaves the session, and the picks, where they were.
    const dropPicksIf = (switched: boolean) => {
        if (switched) setSelectedIds([]);
    };

    const close = () => {
        if (id) void releaseShareIntake(id, { discard: true });
        navigate(ROUTES.home, { replace: true });
    };

    const intake = state.status === 'ready' ? state.intake : null;
    const items = useMemo<ShellFileRef[]>(
        () => (intake ? intake.items.filter(item => !removed.has(item.uri)) : []),
        [intake, removed]
    );
    // Judged as a room's attachment pick is: what the server takes, one message's worth.
    const { accepted, rejected } = useMemo(() => judgeChatAttachments(items, IMAGE_MESSAGE_SLOT_MAX), [items]);
    const notSent = [...(intake?.refused ?? []).map(item => item.name), ...rejected.map(({ item }) => item.name)];
    const content = [message.trim(), intake?.text].filter(Boolean).join('\n');

    const byId = useMemo(() => new Map(destinations.map(destination => [destination.id, destination])), [destinations]);
    const selected = selectedIds.flatMap(selectedId => byId.get(selectedId) ?? []);
    const canSend =
        selected.length > 0 && (accepted.length > 0 || content.length > 0) && !isSending && !cloud.isSwitching;

    const cloudName = cloud.clouds.find(option => option.id === cloud.selectedCloudId)?.name ?? '';
    const placeName = cloud.places.find(option => option.id === cloud.selectedPlaceId)?.name ?? '';

    if (picking) {
        return (
            <DestinationPicker
                destinations={destinations}
                isLoading={isDestinationsLoading}
                initial={selectedIds}
                max={SHARE_DESTINATION_MAX}
                onCancel={() => navigate(-1)}
                onDone={ids => {
                    setSelectedIds(ids);
                    navigate(-1);
                }}
            />
        );
    }

    return (
        <div className="flex h-full flex-col bg-background">
            <ModalTopBar
                title={t('share.title')}
                leftSlot={
                    <button
                        type="button"
                        onClick={close}
                        disabled={isSending}
                        aria-label={t('share.close')}
                        className={ICON_ACTION}
                    >
                        <IconClose className="size-6" />
                    </button>
                }
                rightSlot={
                    intake && (
                        <button
                            type="button"
                            onClick={() => void send({ destinations: selected, files: accepted, content })}
                            disabled={!canSend}
                            aria-label={t('share.send')}
                            className={ICON_ACTION}
                        >
                            {isSending ? (
                                <IconSpinner className="size-5 animate-spin" />
                            ) : (
                                <IconSend className="size-6" />
                            )}
                        </button>
                    )
                }
                divider
            />

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

            {intake && (
                <div className="flex flex-1 flex-col overflow-y-auto pb-[calc(var(--safe-bottom,0px)+1rem)]">
                    <ListRow
                        title={t('share.cloud')}
                        subtitle={cloudName}
                        trailing={<IconChevronRight className="size-5 text-description" />}
                        onClick={() => setSheet('cloud')}
                        disabled={cloud.isSwitching || isSending}
                    />
                    {!cloud.isRelay && (
                        <ListRow
                            title={t('share.place')}
                            subtitle={placeName}
                            trailing={<IconChevronRight className="size-5 text-description" />}
                            onClick={() => setSheet('place')}
                            disabled={cloud.isSwitching || isSending}
                        />
                    )}
                    <ListRow
                        title={t('share.to')}
                        subtitle={
                            selected.length > 0
                                ? selected.map(destination => destination.title).join(', ')
                                : t('share.toPlaceholder')
                        }
                        trailing={
                            cloud.isSwitching ? (
                                <IconSpinner className="size-5 animate-spin text-description" />
                            ) : (
                                <IconChevronRight className="size-5 text-description" />
                            )
                        }
                        onClick={() => setParams({ id: id ?? '', to: '1' })}
                        disabled={cloud.isSwitching || isSending}
                    />

                    <div className="flex flex-col gap-4 px-4 pt-2">
                        <textarea
                            value={message}
                            onChange={event => setMessage(event.target.value)}
                            placeholder={t('share.messagePlaceholder')}
                            aria-label={t('share.messagePlaceholder')}
                            rows={3}
                            disabled={isSending}
                            className="w-full resize-none rounded-2xl bg-secondary px-4 py-3 text-[15px] text-foreground placeholder:text-placeholder focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
                        />
                        {intake.text && (
                            <p className="whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-3 text-[15px] text-foreground">
                                {intake.text}
                            </p>
                        )}
                        <PickedFileStrip
                            files={accepted.map(item => ({ id: item.uri, name: item.name, size: item.size }))}
                            onRemove={uri => setRemoved(prev => new Set(prev).add(uri))}
                            removeLabel={name => t('chat.attach.removeFile', { name })}
                            label={t('share.title')}
                        />
                        {notSent.length > 0 && (
                            <p className="text-[13px] text-description">
                                {t('share.notSent', { names: notSent.join(', ') })}
                            </p>
                        )}
                    </div>
                </div>
            )}

            <ShareOptionSheet
                open={sheet === 'cloud'}
                onOpenChange={open => setSheet(open ? 'cloud' : null)}
                title={t('share.cloud')}
                options={cloud.clouds}
                selectedId={cloud.selectedCloudId}
                onSelect={cid => void cloud.changeCloud(cid).then(dropPicksIf)}
            />
            <ShareOptionSheet
                open={sheet === 'place'}
                onOpenChange={open => setSheet(open ? 'place' : null)}
                title={t('share.place')}
                options={cloud.places}
                selectedId={cloud.selectedPlaceId}
                onSelect={sid => void cloud.changePlace(sid).then(dropPicksIf)}
            />

            {/* One mounted send per picked room; see `useShareSend`. */}
            {selected.map(destination => (
                <DestinationSender
                    key={`${destination.cid}/${destination.id}`}
                    destination={destination}
                    register={register}
                />
            ))}
        </div>
    );
};
