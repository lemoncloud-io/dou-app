import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';

import { runtime } from '@chatic/app-runtime';
import { ToastAction } from '@chatic/ui-kit/components/ui/toast';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import { useNavigateWithTransition } from '@chatic/shared';
import {
    FileSelectionActionBar,
    FileSelectionHeader,
    formatAudioClock,
    formatAudioSize,
    IconAudioWave,
    IconCopy,
    IconDownload,
    IconFileGeneric,
    IconLink,
    IconShare,
    IconTrash,
    MediaViewer,
    MonthGroupHeader,
    RoomFileMoreSheet,
    RoomFileRow,
    RoomFilesHeader,
    RoomFilesTabs,
    RoomMediaGrid,
    SearchInput,
    type FileSelectionAction,
    type RoomFileMoreAction,
} from '@chatic/web-ui-kit';

import { toCloudId } from '../../../hooks/useCloudScope';
import { ROUTES } from '../../../routes/paths';
import { useMessageJumpStore } from '../../../stores/useMessageJumpStore';
import { threadRootNo } from '../../../utils/notifications/notificationModel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useChannel } from '../hooks/useChannel';
import { useFileDownloads } from '../hooks/useFileDownloads';
import { useImageExports, type ExportableMedia } from '../hooks/useImageExports';
import { useRoomFiles, useRoomMediaCounts } from '../hooks/useRoomFiles';
import { useRoomSenderName } from '../hooks/useRoomSenderName';
import { hideMedia, unhideMedia } from '../lib/localMediaPrefs';
import { useAudioTrack, useRoomAudioStore } from '../stores/roomAudioStore';
import { audioTrackOf, isVoiceMessageName } from '../utils/audioPlayback';
import { openExternalUrl } from '../utils/openExternalUrl';
import {
    groupByMonth,
    matchesRoomFileSearch,
    parseRoomFilesTab,
    ROOM_FILES_TABS,
    selectionActionState,
    TAB_KINDS,
    type RoomFileEntry,
    type RoomFilesTab,
} from '../utils/roomFiles';

/** How long the "hidden" toast offers its undo. */
const UNDO_MS = 4000;

const dayFormat = (locale: string) => new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' });

/** An audio row: its own player state, so only the row that plays re-renders on every tick. */
const AudioRow = ({
    entry,
    cid,
    subtitle,
    selection,
    onOpen,
    onLongPress,
    onMore,
}: {
    entry: RoomFileEntry;
    cid: string;
    subtitle: string;
    selection?: { selected: boolean; onToggle: () => void };
    onOpen: () => void;
    onLongPress: () => void;
    onMore: () => void;
}) => {
    const { t } = useTranslation();
    const file = entry.file!;
    const view = useAudioTrack(file.key);
    const name = isVoiceMessageName(file.name)
        ? t('chat.attach.audio.voiceMessage')
        : file.name || t('chat.attach.fileCard.fallbackName');
    const rootNo = entry.chat.parentId ? threadRootNo(entry.chat.parentId) : undefined;
    const track = audioTrackOf(
        {
            cid: entry.chat.cid || cid,
            channelId: entry.chat.channelId,
            chatId: entry.chatId,
            chatNo: entry.chatNo,
            senderName: entry.senderName,
            sentAt: entry.sentAt,
            ...(rootNo ? { threadRootNo: rootNo } : {}),
        },
        file,
        entry.idx
    );
    const playing = view.status === 'playing' || view.status === 'loading';
    return (
        <RoomFileRow
            leading={{
                kind: 'play',
                playing,
                onToggle: () => track && useRoomAudioStore.getState().toggle(track),
            }}
            title={name}
            subtitle={subtitle}
            progress={
                view.active && view.status !== 'idle'
                    ? {
                          position: view.position,
                          duration: view.duration,
                          onSeek: seconds => useRoomAudioStore.getState().seekTrack(file.key, seconds),
                          label: t('chat.attach.audio.seek', { name }),
                      }
                    : undefined
            }
            selection={selection}
            onPress={onOpen}
            onLongPress={onLongPress}
            onMore={onMore}
            playLabel={t('chat.attach.audio.play', { name })}
            pauseLabel={t('chat.attach.audio.pause', { name })}
            moreLabel={t('chat.files.more', { name })}
        />
    );
};

/**
 * The room's files (Figma 6067:22415 for the audio tab): photos·videos, files, audio and links shared
 * in this room, found in this device's message cache through the media index — the server keeps no
 * such list. So the list is "what this device has seen": at its end, "Find older files" loads the
 * room's older messages, which the index takes in, and reads on, until the server has no more.
 *
 * Selecting (the header's "Select", or a long press) acts on several at once: save and share up to ten
 * — share one at a time, as the app's share sheet takes a single file — and delete, which only hides
 * them on this device (with an undo), as nothing here can remove a file from the room for others.
 */
export const RoomFilesPage = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { channelId = '' } = useParams<{ channelId: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = parseRoomFilesTab(searchParams.get('tab'));
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const { channel } = useChannel(channelId || null);
    const cid = toCloudId(channel?.cid || selectedCloudId);
    const uid = runtime.session.useUidInCloud(cid) ?? undefined;
    const scope = cid && uid ? { cid, uid } : undefined;

    const { counts } = useRoomMediaCounts(cid, channelId);
    const files = useRoomFiles({ cid, uid, channelId, tab });
    const downloads = useFileDownloads({ cid });
    const exports = useImageExports({ cid });

    const [query, setQuery] = useState('');
    // Search sits behind the header's search button (Figma 6067:22415), one field for whichever tab is open.
    const [searchOpen, setSearchOpen] = useState(false);
    const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
    const [moreFor, setMoreFor] = useState<RoomFileEntry | null>(null);
    const [confirmHide, setConfirmHide] = useState<readonly RoomFileEntry[] | null>(null);
    const [viewerAt, setViewerAt] = useState<number | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Senders named as the room's rows name them, before the search looks at them.
    const nameOf = useRoomSenderName(channel, uid);
    const shown = useMemo(
        () =>
            files.entries
                .map(entry => ({ ...entry, senderName: nameOf(entry.chat) }))
                .filter(entry => matchesRoomFileSearch(entry, query)),
        [files.entries, nameOf, query]
    );
    const groups = useMemo(() => groupByMonth(shown, i18n.language), [shown, i18n.language]);
    const selecting = selected !== null;
    const picked = shown.filter(entry => selected?.has(entry.key));
    const allowed = selectionActionState(picked.length);
    const viewable = shown.filter(entry => entry.media && entry.media.state === 'ready' && entry.media.src);

    const setTab = (next: RoomFilesTab) => {
        setQuery('');
        setSearchParams({ tab: next }, { replace: true });
    };
    const toggle = (key: string) =>
        setSelected(previous => {
            const next = new Set(previous ?? []);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    // Subscribed, so a length the player learns shows on its row at once.
    const durations = useRoomAudioStore(state => state.durations);
    const metaOf = (entry: RoomFileEntry) => {
        const parts = [entry.senderName, entry.sentAt ? dayFormat(i18n.language).format(new Date(entry.sentAt)) : ''];
        if (entry.file?.audio) {
            const duration = durations[entry.file.key];
            if (duration) parts.push(formatAudioClock(duration));
        }
        const size = formatAudioSize(entry.file?.size ?? entry.media?.size);
        if (size) parts.push(size);
        return parts.filter(Boolean).join(' · ');
    };

    const viewInChat = (entry: RoomFileEntry) => {
        const rootNo = entry.chat.parentId ? threadRootNo(entry.chat.parentId) : undefined;
        navigate(rootNo ? ROUTES.channels.thread(channelId, rootNo) : ROUTES.channels.room(channelId));
        useMessageJumpStore.getState().request(channelId, entry.chatNo, rootNo ? { threadRootNo: rootNo } : undefined);
    };

    const exportableOf = (entry: RoomFileEntry): ExportableMedia | undefined =>
        entry.media && entry.media.state === 'ready'
            ? { uploadId: entry.ref, url: entry.media.src, name: entry.media.name, kind: entry.media.kind }
            : undefined;

    const save = (entries: readonly RoomFileEntry[]) => {
        const media = entries.map(exportableOf).filter((item): item is ExportableMedia => !!item);
        if (media.length) void exports.runAll(media);
        const list = entries.filter(entry => entry.file).map(entry => ({ file: entry.file!, chatId: entry.chatId }));
        if (list.length) void downloads.saveAll(list);
    };

    const share = (entry: RoomFileEntry) => {
        if (entry.kind === 'link') {
            if (typeof navigator.share === 'function') void navigator.share({ url: entry.ref }).catch(() => undefined);
            return;
        }
        const media = exportableOf(entry);
        if (media) void exports.run('share', media);
        else if (entry.file) void downloads.share(entry.file, entry.chatId);
    };

    const copyLinks = async (entries: readonly RoomFileEntry[]) => {
        try {
            await navigator.clipboard.writeText(entries.map(entry => entry.ref).join('\n'));
            toast({ title: t('chat.files.linkCopied', { count: entries.length }) });
        } catch {
            toast({ title: t('chat.files.linkCopyFailed'), variant: 'destructive' });
        }
    };

    const hide = (entries: readonly RoomFileEntry[]) => {
        if (!scope || entries.length === 0) return;
        const keys = entries.map(entry => entry.key);
        const current = useRoomAudioStore.getState().current;
        if (current && entries.some(entry => entry.file?.key === current.key)) useRoomAudioStore.getState().stop();
        hideMedia(scope, keys);
        setSelected(null);
        const undo = t('chat.files.undo');
        toast({
            title: t('chat.files.hidden', { count: keys.length }),
            duration: UNDO_MS,
            action: (
                <ToastAction altText={undo} onClick={() => unhideMedia(scope, keys)}>
                    {undo}
                </ToastAction>
            ),
        });
    };

    const open = (entry: RoomFileEntry) => {
        if (selecting) {
            toggle(entry.key);
            return;
        }
        if (entry.kind === 'link') openExternalUrl(entry.ref);
        else if (entry.file?.audio) navigate(ROUTES.channels.audio(channelId, entry.chatNo, entry.idx));
        else if (entry.file) void downloads.open(entry.file, entry.chatId);
    };

    const moreActions = (entry: RoomFileEntry): RoomFileMoreAction[] => [
        ...(entry.file?.audio ? [{ key: 'detail', label: t('chat.files.details'), onPress: () => open(entry) }] : []),
        { key: 'view', label: t('chat.attach.audio.viewInChat'), onPress: () => viewInChat(entry) },
        ...(entry.kind === 'link'
            ? [{ key: 'copy', label: t('chat.files.copyLink'), onPress: () => void copyLinks([entry]) }]
            : [{ key: 'save', label: t('chat.attach.audio.save'), onPress: () => save([entry]) }]),
        { key: 'share', label: t('chat.files.shareOut'), onPress: () => share(entry) },
        { key: 'delete', label: t('chat.files.delete'), destructive: true, onPress: () => setConfirmHide([entry]) },
    ];

    const tabCount = (key: RoomFilesTab) =>
        counts ? TAB_KINDS[key].reduce((sum, kind) => sum + (counts[kind] ?? 0), 0) : undefined;

    const selectionActions: FileSelectionAction[] = [
        tab === 'link'
            ? {
                  key: 'copy',
                  icon: <IconCopy size={24} />,
                  label: t('chat.files.copyLink'),
                  onPress: () => void copyLinks(picked),
                  disabled: !allowed.save,
              }
            : {
                  key: 'save',
                  icon: <IconDownload size={24} />,
                  label: t('chat.attach.audio.save'),
                  onPress: () => {
                      save(picked);
                      setSelected(null);
                  },
                  disabled: !allowed.save,
              },
        {
            key: 'share',
            icon: <IconShare size={24} />,
            label: t('chat.attach.audio.share'),
            onPress: () => picked[0] && share(picked[0]),
            disabled: !allowed.share,
        },
        {
            key: 'delete',
            icon: <IconTrash size={24} />,
            label: t('chat.files.delete'),
            onPress: () => setConfirmHide(picked),
            disabled: !allowed.delete,
            destructive: true,
        },
    ];

    const emptyKey = `chat.files.empty.${tab}` as const;

    return (
        <div className="relative flex h-full flex-col overflow-hidden bg-background">
            {selecting ? (
                <FileSelectionHeader
                    title={
                        picked.length
                            ? t('chat.files.selectedCount', { count: picked.length })
                            : t('chat.files.selectItems')
                    }
                    onCancel={() => setSelected(null)}
                    cancelLabel={t('chat.files.cancel')}
                    toggleAllLabel={
                        picked.length === shown.length && shown.length > 0
                            ? t('chat.files.deselectAll')
                            : t('chat.files.selectAll')
                    }
                    onToggleAll={() =>
                        setSelected(picked.length === shown.length ? new Set() : new Set(shown.map(entry => entry.key)))
                    }
                    toggleAllDisabled={shown.length === 0}
                />
            ) : (
                <RoomFilesHeader
                    title={t('chat.files.title')}
                    onBack={() => navigate(-1)}
                    backLabel={t('chat.attach.audio.back')}
                    onSearch={() => setSearchOpen(open => !open)}
                    searchLabel={t('chat.files.searchLabel')}
                    searchActive={searchOpen}
                    actionLabel={t('chat.files.select')}
                    onAction={() => setSelected(new Set())}
                    actionDisabled={shown.length === 0}
                />
            )}
            <RoomFilesTabs
                // The design numbers only the tab that is open.
                tabs={ROOM_FILES_TABS.map(key => ({
                    key,
                    label: t(`chat.files.tab.${key}`),
                    ...(key === tab ? { count: tabCount(key) } : {}),
                }))}
                value={tab}
                onChange={key => setTab(key as RoomFilesTab)}
                dimmed={selecting}
            />
            {(searchOpen || query) && (
                <div className="px-4 pb-2 pt-3">
                    <SearchInput
                        autoFocus
                        value={query}
                        onChange={setQuery}
                        placeholder={t(tab === 'link' ? 'chat.files.searchLinks' : 'chat.files.search')}
                        label={t('chat.files.searchLabel')}
                    />
                </div>
            )}
            <div
                ref={listRef}
                className="min-h-0 flex-1 overflow-y-auto"
                onScroll={event => {
                    const el = event.currentTarget;
                    if (files.hasMorePages && el.scrollTop + el.clientHeight > el.scrollHeight - 400) {
                        void files.loadMore();
                    }
                }}
            >
                {files.loading ? (
                    <p className="py-16 text-center text-[14px] text-description">{t('chat.files.searching')}</p>
                ) : shown.length === 0 && !files.searching ? (
                    <p className="py-16 text-center text-[14px] text-description">
                        {query ? t('chat.files.noMatch') : t(emptyKey)}
                    </p>
                ) : (
                    groups.map(group => (
                        <section key={group.key}>
                            <MonthGroupHeader label={group.label} sticky />
                            {tab === 'media' ? (
                                <RoomMediaGrid
                                    items={group.entries.map(entry => ({
                                        key: entry.key,
                                        src: entry.media?.preview,
                                        kind: entry.media?.kind ?? 'image',
                                    }))}
                                    onOpen={key => {
                                        if (selecting) return toggle(key);
                                        const at = viewable.findIndex(entry => entry.key === key);
                                        if (at >= 0) setViewerAt(at);
                                    }}
                                    selection={selected ? { selectedKeys: selected, onToggle: toggle } : undefined}
                                    onLongPress={key => setSelected(new Set([key]))}
                                    tileLabel={(index, kind) =>
                                        t(kind === 'video' ? 'chat.attach.tileVideo' : 'chat.attach.tile', {
                                            position: index + 1,
                                        })
                                    }
                                />
                            ) : (
                                group.entries.map(entry => {
                                    const selection = selecting
                                        ? { selected: !!selected?.has(entry.key), onToggle: () => toggle(entry.key) }
                                        : undefined;
                                    const common = {
                                        onLongPress: () => setSelected(new Set([entry.key])),
                                        onMore: () => setMoreFor(entry),
                                    };
                                    if (entry.file?.audio) {
                                        return (
                                            <AudioRow
                                                key={entry.key}
                                                entry={entry}
                                                cid={cid}
                                                subtitle={metaOf(entry)}
                                                selection={selection}
                                                onOpen={() => open(entry)}
                                                {...common}
                                            />
                                        );
                                    }
                                    const link = entry.kind === 'link';
                                    return (
                                        <RoomFileRow
                                            key={entry.key}
                                            leading={{
                                                kind: 'icon',
                                                icon: link ? (
                                                    <IconLink size={20} />
                                                ) : entry.file ? (
                                                    <IconFileGeneric size={22} />
                                                ) : (
                                                    <IconAudioWave />
                                                ),
                                            }}
                                            title={
                                                link
                                                    ? entry.ref
                                                    : entry.file?.name || t('chat.attach.fileCard.fallbackName')
                                            }
                                            subtitle={metaOf(entry)}
                                            selection={selection}
                                            onPress={() => open(entry)}
                                            moreLabel={t('chat.files.more', {
                                                name: link ? entry.ref : (entry.file?.name ?? ''),
                                            })}
                                            {...common}
                                        />
                                    );
                                })
                            )}
                        </section>
                    ))
                )}
                {(files.searching || files.canFindOlder) && !query && (
                    <div
                        className="flex justify-center px-4 py-6"
                        style={{ paddingBottom: selecting ? 140 : undefined }}
                    >
                        <button
                            type="button"
                            onClick={() => void files.findOlder()}
                            disabled={files.searching}
                            className="h-10 rounded-full bg-action-soft px-5 text-[14px] font-medium text-foreground disabled:opacity-60"
                        >
                            {files.searching ? t('chat.files.searching') : t('chat.files.findOlder')}
                        </button>
                    </div>
                )}
                {selecting && <div aria-hidden className="h-32" />}
            </div>
            {selecting && (
                <FileSelectionActionBar
                    actions={selectionActions}
                    notice={allowed.overLimit ? t('chat.files.exportLimit') : undefined}
                />
            )}
            {moreFor && (
                <RoomFileMoreSheet
                    open
                    onOpenChange={next => !next && setMoreFor(null)}
                    name={moreFor.kind === 'link' ? moreFor.ref : (moreFor.file?.name ?? moreFor.media?.name ?? '')}
                    meta={metaOf(moreFor)}
                    actions={moreActions(moreFor)}
                />
            )}
            <ConfirmDialog
                open={!!confirmHide}
                onOpenChange={next => !next && setConfirmHide(null)}
                title={
                    confirmHide && confirmHide.length > 1
                        ? t('chat.files.hideTitleMany', { count: confirmHide.length })
                        : t('chat.files.hideTitleOne')
                }
                description={t('chat.files.hideDescription')}
                confirmLabel={t('chat.files.delete')}
                onConfirm={() => {
                    if (confirmHide) hide(confirmHide);
                    setConfirmHide(null);
                }}
            />
            <MediaViewer
                items={viewable.map(entry => ({
                    key: entry.key,
                    kind: entry.media!.kind,
                    src: entry.media!.src,
                    preview: entry.media!.preview,
                    state: 'ready' as const,
                }))}
                index={viewerAt}
                autoPlay
                onIndexChange={setViewerAt}
                onClose={() => setViewerAt(null)}
                labels={{
                    title: t('chat.attach.viewer'),
                    close: t('chat.attach.viewerClose'),
                    previous: t('chat.attach.viewerPrevious'),
                    next: t('chat.attach.viewerNext'),
                    play: t('chat.attach.viewerPlay'),
                }}
            />
        </div>
    );
};
