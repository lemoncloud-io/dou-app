import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ChangeEvent,
    type ReactNode,
    type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';

import type { AttachmentPickSource } from '@chatic/bridge-messages';
import {
    runtime,
    CHAT_IMAGE_TYPES,
    chatAttachmentStoredKind,
    IMAGE_MESSAGE_SLOT_MAX,
    judgeChatAttachments,
    judgeChatImages,
    type ChatAttachmentJudgement,
    type ChatAttachmentSource,
    type ChatMentionBody,
} from '@chatic/runtime';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    AlertDialog,
    AttachPanel,
    AttachSourceSheet,
    AudioSendSheet,
    formatAudioMeta,
    ComposerAttachButton,
    PhotoEditor,
    PhotoGridSheet,
    PickedFileStrip,
    RecentPhotoStrip,
    SelectedPhotoStrip,
    UnsendableFilesDialog,
    type CropAspect,
    type PhotoEdit,
    type PhotoEditorItem,
    type PhotoItem,
    type PickedFileItem,
} from '@chatic/web-ui-kit';

import { appBridge } from '../../../bridge/appBridge';
import {
    attachmentPicker as shellAttachmentPicker,
    type AttachmentPick,
    type AttachmentPicker,
} from '../../../bridge/attachmentPicker';
import { cameraAccess as shellCameraAccess, type CameraAccessGate } from '../../../bridge/cameraAccess';
import { useAttachPanelSlot } from '../hooks/useAttachPanelSlot';
import { useLocalAudioDurations } from '../hooks/useLocalAudioDurations';
import { usePhotoGridColumns } from '../hooks/usePhotoGridColumns';
import { editsDiffer, usePhotoPicker, type PhotoPicker } from '../hooks/usePhotoPicker';
import { usePhotoSendGrouping } from '../hooks/usePhotoSendGrouping';
import { type HeldFileDraft, useComposerDraftStore } from '../stores/useComposerDraftStore';
import { albumAccept, documentAccept, isAppleTouchWebKit, rejectionKey } from '../utils/attachSources';
import { PHONE_SENDS } from '../../../utils';

const PHOTO_ACCEPT = CHAT_IMAGE_TYPES.join(',');

const NO_SOURCES: readonly ChatAttachmentSource[] = [];

const NO_PHOTOS: PhotoItem[] = [];

type HeldFile = HeldFileDraft;

const NO_FILES: readonly HeldFile[] = [];

let heldSeq = 0;

const heldIn = (scope: string | undefined): readonly HeldFile[] =>
    (scope !== undefined && useComposerDraftStore.getState().held[scope]) || NO_FILES;

const keepHeld = (scope: string | undefined, files: readonly HeldFile[]) => {
    if (scope !== undefined) useComposerDraftStore.getState().setHeld(scope, files);
};
const NO_FILE_ITEMS: PickedFileItem[] = [];

export const INPUT_CLICK_WINDOW_MS = 800;

interface UseChatImageAttachInput {
    sendImages: (files: ChatAttachmentSource[], options?: runtime.data.SendImagesOptions) => Promise<void>;
    disabled?: boolean;
    inputRef?: RefObject<HTMLTextAreaElement | null>;
    composerRef?: RefObject<HTMLElement | null>;
    onComposerSlide?: (sliding: boolean) => void;
    onUnsentText?: (text: string) => void;
    scope?: string;
    onVoice?: () => void;
    picker?: PhotoPicker;
    shellPicker?: AttachmentPicker;
    now?: () => number;
    cameraAccess?: CameraAccessGate;
}

interface ChatImageAttach {
    button: ReactNode;
    strip: ReactNode;
    overlays: ReactNode;
    panelOpen: boolean;
    sendReady: boolean;
    sendPicked: (text: string, mention?: ChatMentionBody) => boolean;
    closePanel: () => void;
}

export const useChatImageAttach = ({
    sendImages,
    disabled = false,
    inputRef,
    composerRef,
    onComposerSlide,
    onUnsentText,
    scope,
    onVoice,
    picker: injected,
    shellPicker = shellAttachmentPicker,
    now = Date.now,
    cameraAccess = shellCameraAccess,
}: UseChatImageAttachInput): ChatImageAttach => {
    const { t } = useTranslation();
    const slot = useAttachPanelSlot({ inputRef, composerRef, onComposerSlide });
    const { hide: hidePanel } = slot;
    const [permission, setPermission] = useState<{ open: boolean; kind: 'photos' | 'camera' }>({
        open: false,
        kind: 'photos',
    });
    const [sourceOpen, setSourceOpen] = useState(false);
    const [probing, setProbing] = useState(false);
    const libraryRef = useRef<HTMLInputElement>(null);
    const cameraRef = useRef<HTMLInputElement>(null);
    const albumRef = useRef<HTMLInputElement>(null);
    const filesRef = useRef<HTMLInputElement>(null);
    const appleTouch = isAppleTouchWebKit();
    const gridColumns = usePhotoGridColumns();

    const [held, setHeldState] = useState<readonly HeldFile[]>(() => heldIn(scope));
    const heldRef = useRef<readonly HeldFile[]>(held);
    const scopeRef = useRef(scope);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);
    const setHeld = useCallback((next: readonly HeldFile[]) => {
        heldRef.current = next;
        setHeldState(next);
        keepHeld(scopeRef.current, next);
    }, []);
    const photoMax = Math.max(0, IMAGE_MESSAGE_SLOT_MAX - held.length);

    const own = usePhotoPicker({
        max: photoMax,
        allTitle: t('chat.attach.recentTitle'),
        columns: gridColumns.columns,
    });
    const picker = injected ?? own;
    const inGrid = picker.supported === true;
    const grouping = usePhotoSendGrouping();
    const panelOpen = slot.open && !disabled;
    const [readingHeld, setReadingHeld] = useState(false);
    const busy = picker.preparing || readingHeld;
    const sendReady = (picker.picked.length > 0 || held.length > 0) && !busy && !disabled;

    const [editorOpen, setEditorOpen] = useState(false);
    const [editorOver, setEditorOver] = useState<'grid' | 'composer'>('grid');
    const [editorIndex, setEditorIndex] = useState(0);
    const [discardOpen, setDiscardOpen] = useState(false);
    const editsAtOpen = useRef<ReadonlyMap<string, PhotoEdit>>(new Map());
    const editorVisible = editorOpen && !disabled && (editorOver === 'composer' || picker.gridOpen);
    const editorAt = Math.min(editorIndex, Math.max(0, picker.picked.length - 1));

    const judge = useCallback(
        (
            items: ChatAttachmentSource[],
            {
                refusedByShell = [],
                photosOnly = false,
                editFailed = 0,
                max = IMAGE_MESSAGE_SLOT_MAX,
            }: {
                refusedByShell?: AttachmentPick['refused'];
                photosOnly?: boolean;
                editFailed?: number;
                max?: number;
            } = {}
        ): ChatAttachmentSource[] => {
            const { accepted, rejected }: ChatAttachmentJudgement<ChatAttachmentSource> = photosOnly
                ? (() => {
                      const judged = judgeChatImages(items as File[], max);
                      return {
                          accepted: judged.accepted,
                          rejected: judged.rejected.map(({ file, reason }) =>
                              reason === 'too-large'
                                  ? { item: file, reason, kind: 'image' as const }
                                  : { item: file, reason }
                          ),
                      };
                  })()
                : judgeChatAttachments(items, max, PHONE_SENDS);
            const [shellFirst] = refusedByShell;
            if (editFailed > 0) {
                toast({ title: t('chat.attach.edit.bakeFailed') });
            } else if (shellFirst) {
                const key =
                    shellFirst.reason === 'too-large'
                        ? `chat.attach.rejected.too-large.${shellFirst.kind}`
                        : shellFirst.reason === 'unsupported' && shellFirst.kind === 'video'
                          ? 'chat.attach.rejected.unsupportedVideo'
                          : `chat.attach.rejected.${shellFirst.reason}`;
                toast({ title: t(key, { max: IMAGE_MESSAGE_SLOT_MAX }) });
            } else if (rejected.length > 0) {
                const [first] = rejected;
                toast({ title: t(rejectionKey(first, first.item), { max: IMAGE_MESSAGE_SLOT_MAX }) });
            }
            return accepted;
        },
        [t]
    );

    const send = useCallback(
        (
            items: ChatAttachmentSource[],
            {
                separately = false,
                caption = '',
                mention,
                ...judging
            }: Parameters<typeof judge>[1] & {
                separately?: boolean;
                caption?: string;
                mention?: ChatMentionBody;
            } = {}
        ) => {
            const accepted = judge(items, judging);
            if (accepted.length === 0) {
                if (caption) onUnsentText?.(caption);
                return;
            }
            const options: runtime.data.SendImagesOptions = {};
            if (separately && accepted.length > 1) options.separately = true;
            if (caption) options.content = caption;
            if (caption && mention) options.mention = mention;
            const sending =
                options.separately || options.content ? sendImages(accepted, options) : sendImages(accepted);
            sending.catch(() => toast({ title: t('chat.attach.sendFailed'), variant: 'destructive' }));
        },
        [judge, sendImages, onUnsentText, t]
    );

    const keepAbove = useCallback(
        (accepted: readonly ChatAttachmentSource[]) => {
            const before = heldRef.current;
            const waiting = new Set(before.map(file => file.source));
            const added = accepted.filter(source => !waiting.has(source));
            if (added.length === 0) return;
            setHeld([
                ...before,
                ...added.map(source => {
                    heldSeq += 1;
                    return { id: `held-${heldSeq}`, source };
                }),
            ]);
        },
        [setHeld]
    );

    const [audioToSend, setAudioToSend] = useState<readonly ChatAttachmentSource[] | null>(null);
    const [audioSheetOpen, setAudioSheetOpen] = useState(false);
    const [unsendable, setUnsendable] = useState<{
        refused: { key: string; name: string; reason: string }[];
        rest: readonly ChatAttachmentSource[];
    } | null>(null);
    const audioDurations = useLocalAudioDurations(audioToSend ?? NO_SOURCES);

    const isAudioSource = (source: ChatAttachmentSource) => chatAttachmentStoredKind(source) === 'audio';
    const proceedWithPick = useCallback(
        (accepted: readonly ChatAttachmentSource[]) => {
            if (accepted.length === 0) return;
            if (heldRef.current.length === 0 && accepted.every(isAudioSource)) {
                setAudioToSend(accepted);
                setAudioSheetOpen(true);
            } else keepAbove(accepted);
        },
        [keepAbove]
    );

    const hold = useCallback(
        (items: ChatAttachmentSource[], { refusedByShell }: { refusedByShell?: AttachmentPick['refused'] } = {}) => {
            const before = heldRef.current;
            const max = IMAGE_MESSAGE_SLOT_MAX - picker.picked.length;
            if (before.length === 0 && items.some(isAudioSource)) {
                const empty = items.filter(source => source.size === 0);
                const { accepted, rejected } = judgeChatAttachments(
                    items.filter(source => source.size !== 0),
                    max,
                    PHONE_SENDS
                );
                const refused = [
                    ...(refusedByShell ?? []).map((item, at) => ({
                        key: `shell-${at}`,
                        name: item.name,
                        reason: t(
                            item.reason === 'too-large'
                                ? `chat.attach.rejected.too-large.${item.kind}`
                                : `chat.attach.rejected.${item.reason}`,
                            { max: IMAGE_MESSAGE_SLOT_MAX }
                        ),
                    })),
                    ...empty.map((source, at) => ({
                        key: `empty-${at}`,
                        name: source.name,
                        reason: t('chat.attach.rejected.empty'),
                    })),
                    ...rejected.map((rejection, at) => ({
                        key: `judged-${at}`,
                        name: rejection.item.name,
                        reason: t(rejectionKey(rejection, rejection.item), { max: IMAGE_MESSAGE_SLOT_MAX }),
                    })),
                ];
                if (refused.length > 0) {
                    setUnsendable({ refused, rest: accepted });
                    return;
                }
                proceedWithPick(accepted);
                return;
            }
            const waiting = new Set(before.map(file => file.source));
            const accepted = judge([...before.map(file => file.source), ...items], { refusedByShell, max });
            keepAbove(accepted.filter(source => !waiting.has(source)));
        },
        [judge, keepAbove, picker.picked.length, proceedWithPick, t]
    );

    const sendAudio = (items: readonly ChatAttachmentSource[]) => {
        if (items.length === 0) return;
        shellPicker
            .readPhotos([...items])
            .then(read => send(read.items, { refusedByShell: read.refused }))
            .catch(() => toast({ title: t('chat.attach.sendFailed'), variant: 'destructive' }));
    };

    const removeHeld = (id: string) => setHeld(heldRef.current.filter(file => file.id !== id));

    const pickedFrom = useCallback(
        (photosOnly: boolean) => (event: ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            send(files, { photosOnly });
        },
        [send]
    );
    const handlePhotosPicked = pickedFrom(true);
    const handleAttachmentsPicked = pickedFrom(false);
    const handleFilesPicked = (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        hold(files);
    };

    useLayoutEffect(() => {
        if (disabled) hidePanel();
    }, [disabled, hidePanel]);

    const { clearPicked, closeGrid } = picker;
    useLayoutEffect(() => {
        if (scopeRef.current === scope) return;
        scopeRef.current = scope;
        const next = heldIn(scope);
        heldRef.current = next;
        setHeldState(next);
        clearPicked();
        closeGrid();
        setEditorOpen(false);
        setDiscardOpen(false);
        setSourceOpen(false);
        hidePanel();
    }, [scope, clearPicked, closeGrid, hidePanel]);

    const dismissPanel = () => {
        hidePanel();
        picker.clearPicked();
    };

    const togglePanel = () => {
        if (panelOpen) {
            dismissPanel();
            return;
        }
        slot.show();
        inputRef?.current?.blur();
        if (picker.supported === null) {
            setProbing(true);
            void picker.probe().finally(() => setProbing(false));
        } else if (picker.supported) {
            void picker.probe();
        }
    };

    const pickFrom = (ref: RefObject<HTMLInputElement | null>) => () => {
        hidePanel();
        ref.current?.click();
    };

    const openCamera = () => {
        hidePanel();
        if (runtime.media.cameraPermission === null || cameraAccess.isGranted()) {
            cameraRef.current?.click();
            return;
        }
        const tappedAt = now();
        const tappedIn = scopeRef.current;
        void cameraAccess.request().then(access => {
            if (!mountedRef.current || scopeRef.current !== tappedIn) return;
            if (access === 'refused') setPermission({ open: true, kind: 'camera' });
            else if (now() - tappedAt <= INPUT_CLICK_WINDOW_MS) cameraRef.current?.click();
            else toast({ title: t('chat.attach.tapAgain') });
        });
    };

    const pickFromShell = (source: AttachmentPickSource, ref: RefObject<HTMLInputElement | null>) => () => {
        setSourceOpen(false);
        const holds = source === 'document';
        const room = holds ? IMAGE_MESSAGE_SLOT_MAX - picker.picked.length - held.length : IMAGE_MESSAGE_SLOT_MAX;
        if (room <= 0) {
            toast({ title: t('chat.attach.rejected.limit', { max: IMAGE_MESSAGE_SLOT_MAX }) });
            return;
        }
        if (shellPicker.isUnsupported()) {
            ref.current?.click();
            return;
        }
        shellPicker
            .pick({ source, selectionLimit: room })
            .then(picked => {
                if (!picked) return;
                if (holds) hold(picked.items, { refusedByShell: picked.refused });
                else send(picked.items, { refusedByShell: picked.refused });
            })
            .catch(error => {
                if ((error as { code?: string })?.code === 'BUSY') return;
                toast({ title: t('chat.attach.sendFailed'), variant: 'destructive' });
            });
    };

    const openSources = () => {
        hidePanel();
        setSourceOpen(true);
    };

    const openGrid = () => {
        if (picker.access === 'denied') {
            setPermission({ open: true, kind: 'photos' });
            return;
        }
        picker.openGrid();
    };

    const toggleRecent = (id: string) => {
        const photo = picker.recent.find(item => item.id === id);
        if (photo) picker.toggle(photo);
    };

    const sendPick = (caption = '', mention?: ChatMentionBody) => {
        if (picker.preparing) return;
        const separately = !grouping.grouped;
        hidePanel();
        picker
            .takePicked()
            .then(picked =>
                send(picked.items, {
                    refusedByShell: picked.refused,
                    editFailed: picked.editFailed,
                    separately,
                    caption,
                    mention,
                })
            )
            .catch(() => {
                toast({ title: t('chat.attach.sendFailed'), variant: 'destructive' });
                if (caption) onUnsentText?.(caption);
            });
    };

    const sendPicked = (text: string, mention?: ChatMentionBody): boolean => {
        if (!sendReady) return false;
        const caption = text.trim();
        const waiting = heldRef.current;
        const sentFrom = scopeRef.current;
        if (waiting.length === 0) {
            sendPick(caption, mention);
            return true;
        }
        const withPick = picker.picked.length > 0;
        hidePanel();
        setReadingHeld(true);
        shellPicker
            .readPhotos(waiting.map(file => file.source))
            .then(async read => {
                const picked: Awaited<ReturnType<PhotoPicker['takePicked']>> = withPick
                    ? await picker.takePicked()
                    : { items: [], refused: [] };
                if (scopeRef.current === sentFrom) {
                    setHeld(heldRef.current.filter(file => !waiting.includes(file)));
                } else {
                    keepHeld(
                        sentFrom,
                        heldIn(sentFrom).filter(file => !waiting.includes(file))
                    );
                }
                send([...picked.items, ...read.items], {
                    refusedByShell: [...picked.refused, ...read.refused],
                    editFailed: picked.editFailed,
                    caption,
                    mention,
                });
            })
            .catch(() => {
                toast({ title: t('chat.attach.sendFailed'), variant: 'destructive' });
                if (caption) onUnsentText?.(caption);
            })
            .finally(() => setReadingHeld(false));
        return true;
    };

    const isEditable = (item: PhotoItem) => item.kind !== 'video' && picker.editAssets.get(item.id)?.editable !== false;

    const openEditor = (over: 'grid' | 'composer', id?: string) => {
        if (picker.preparing || picker.picked.length === 0) return;
        const at =
            id !== undefined ? picker.picked.findIndex(item => item.id === id) : picker.picked.findIndex(isEditable);
        setEditorOver(over);
        setEditorIndex(Math.max(0, at));
        editsAtOpen.current = picker.edits;
        setDiscardOpen(false);
        setEditorOpen(true);
    };

    const closeEditor = () => {
        setEditorOpen(false);
        setDiscardOpen(false);
    };

    const leaveEditor = () => {
        closeEditor();
        if (editorOver === 'composer') picker.releaseBytes();
    };

    const cancelEditor = () => {
        if (editsDiffer(editsAtOpen.current, picker.edits)) setDiscardOpen(true);
        else leaveEditor();
    };

    const discardEdits = () => {
        picker.restoreEdits(editsAtOpen.current);
        leaveEditor();
    };

    const sendFromEditor = () => {
        closeEditor();
        sendPick();
    };

    useEffect(() => {
        if (!picker.gridOpen && editorOver === 'grid') closeEditor();
    }, [picker.gridOpen, editorOver]);

    const { picked: pickedItems, loadForEdit } = picker;
    useEffect(() => {
        if (!editorVisible) {
            loadForEdit();
            return;
        }
        const around = [editorAt, editorAt + 1, editorAt - 1]
            .map(position => pickedItems[position])
            .filter((item): item is PhotoItem => item !== undefined && item.kind !== 'video');
        if (around.length > 0) loadForEdit(...around.map(item => item.id));
    }, [editorVisible, editorAt, pickedItems, loadForEdit]);

    const button = (
        <ComposerAttachButton
            open={panelOpen}
            onClick={togglePanel}
            disabled={disabled}
            label={panelOpen ? t('chat.attach.close') : t('chat.attach.open')}
        />
    );

    const recentItems = inGrid && picker.access !== 'denied' ? picker.recent : NO_PHOTOS;
    const recentPending = picker.supported === null && probing;
    const recentKnownEmpty = !recentPending && recentItems.length === 0;
    const recent =
        runtime.media.photoLibrary !== null || inGrid ? (
            <RecentPhotoStrip
                title={t('chat.attach.recentTitle')}
                seeAllLabel={t('chat.attach.seeAll')}
                onSeeAll={openGrid}
                photos={recentItems}
                loading={recentPending}
                picked={picker.picked.map(item => item.id)}
                onToggle={toggleRecent}
                max={photoMax}
                photoLabel={position => t('chat.attach.recentPhoto', { position })}
                videoLabel={position => t('chat.attach.recentVideo', { position })}
            />
        ) : undefined;

    const removePicked = (id: string) => {
        const item = picker.picked.find(photo => photo.id === id);
        if (item) picker.toggle(item);
    };
    const inRecentRow = new Set(panelOpen ? recentItems.map(item => item.id) : []);
    const stripShown = !disabled && picker.picked.some(item => !inRecentRow.has(item.id));
    const filesShown = !disabled && held.length > 0;
    const heldItems = filesShown
        ? held.map(({ id, source }) => ({ id, name: source.name, size: source.size }))
        : NO_FILE_ITEMS;
    const strip =
        inGrid || held.length > 0 ? (
            <div
                onPointerDown={event => event.preventDefault()}
                onMouseDown={event => event.preventDefault()}
                aria-busy={((stripShown || filesShown) && busy) || undefined}
                className={`transition-opacity${busy ? ' pointer-events-none opacity-50' : ''}`}
            >
                {inGrid && (
                    <SelectedPhotoStrip
                        size="compact"
                        className="mb-2"
                        label={t('chat.attach.pickedTitle')}
                        photos={stripShown ? picker.picked : NO_PHOTOS}
                        onRemove={removePicked}
                        onSelect={id => openEditor('composer', id)}
                        removeLabel={position => t('chat.attach.removePicked', { position })}
                        selectLabel={position => t('chat.attach.edit.select', { position })}
                        editedLabel={t('chat.attach.edit.edited')}
                    />
                )}
                <PickedFileStrip
                    className="mb-2"
                    label={t('chat.attach.pickedFiles')}
                    files={heldItems}
                    onRemove={removeHeld}
                    removeLabel={name => t('chat.attach.removeFile', { name })}
                />
            </div>
        ) : null;

    const limitedNotice =
        picker.access === 'limited' ? (
            <div className="flex items-center justify-between gap-3 px-4 pb-2 text-[14px] leading-[1.4]">
                <span className="text-description">{t('chat.attach.limitedNotice')}</span>
                <button
                    type="button"
                    onClick={() => void picker.manageSelection()}
                    className="shrink-0 text-point-blue"
                >
                    {t('chat.attach.limitedMore')}
                </button>
            </div>
        ) : undefined;

    const sendLabel = picker.preparing
        ? t('chat.attach.preparing')
        : t('chat.attach.send', { count: picker.picked.length });

    const editorItems: PhotoEditorItem[] = picker.picked.map(item => {
        const asset = picker.editAssets.get(item.id);
        const edit = picker.edits.get(item.id);
        const ready = asset?.status === 'ready' && asset.src && asset.width && asset.height ? asset : undefined;
        return {
            id: item.id,
            previewSrc: item.src,
            ...(ready ? { src: ready.src, width: ready.width, height: ready.height } : {}),
            ...(edit ? { edit } : {}),
            editable: isEditable(item),
            ...(asset?.status === 'failed' ? { failed: true } : {}),
            ...(item.kind ? { kind: item.kind } : {}),
            ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {}),
        };
    });

    const aspectLabels: Record<CropAspect, string> = {
        free: t('chat.attach.edit.aspectFree'),
        original: t('chat.attach.edit.aspectOriginal'),
        '1:1': '1:1',
        '4:3': '4:3',
        '3:4': '3:4',
        '16:9': '16:9',
        '9:16': '9:16',
    };

    const overlays = (
        <>
            <input
                ref={libraryRef}
                type="file"
                accept={PHOTO_ACCEPT}
                multiple
                hidden
                onChange={handlePhotosPicked}
                data-testid="chat-attach-library"
            />
            <input
                ref={albumRef}
                type="file"
                accept={albumAccept(appleTouch)}
                multiple
                hidden
                onChange={handleAttachmentsPicked}
                data-testid="chat-attach-album"
            />
            <input
                ref={filesRef}
                type="file"
                accept={documentAccept(appleTouch)}
                multiple
                hidden
                onChange={handleFilesPicked}
                data-testid="chat-attach-files"
            />
            <input
                ref={cameraRef}
                type="file"
                accept={PHOTO_ACCEPT}
                capture="environment"
                hidden
                onChange={handlePhotosPicked}
                data-testid="chat-attach-camera"
            />
            <AttachPanel
                ref={slot.panel.ref}
                motion="external"
                open={slot.panel.open}
                height={slot.panel.height}
                enter={slot.panel.enter}
                exit={slot.panel.exit}
                recent={recent}
                recentEmpty={recentKnownEmpty}
                onPhoto={inGrid ? openGrid : pickFrom(libraryRef)}
                onCamera={openCamera}
                onFile={openSources}
                onVoice={
                    onVoice &&
                    (() => {
                        hidePanel();
                        onVoice();
                    })
                }
                onClose={dismissPanel}
                labels={{
                    title: t('chat.attach.menuTitle'),
                    photo: t('chat.attach.photo'),
                    camera: t('chat.attach.camera'),
                    file: t('chat.attach.file'),
                    voice: t('chat.attach.voice.entry'),
                }}
            />
            <AttachSourceSheet
                open={sourceOpen && !disabled}
                onOpenChange={setSourceOpen}
                title={t('chat.attach.source.title')}
                onAlbum={pickFromShell('media', albumRef)}
                onFiles={pickFromShell('document', filesRef)}
                labels={{ album: t('chat.attach.source.album'), files: t('chat.attach.source.files') }}
                notice={appleTouch && shellPicker.isUnsupported() ? t('chat.attach.source.videoInApp') : undefined}
            />
            {inGrid && (
                <PhotoGridSheet
                    open={picker.gridOpen && !disabled}
                    onOpenChange={value => !value && picker.closeGrid()}
                    albumTitle={picker.album.title}
                    albumsOpen={picker.albumsOpen}
                    onToggleAlbums={picker.toggleAlbums}
                    albums={picker.albums}
                    onSelectAlbum={picker.selectAlbum}
                    formatAlbumCount={count => count.toLocaleString()}
                    count={picker.count}
                    photoAt={picker.photoAt}
                    loading={picker.loading}
                    onVisibleRangeChange={picker.setVisibleRange}
                    columns={gridColumns.columns}
                    onColumnsChange={gridColumns.setColumns}
                    picked={picker.picked}
                    onToggle={picker.toggle}
                    max={photoMax}
                    onCamera={() => {
                        picker.closeGrid();
                        openCamera();
                    }}
                    sendLabel={sendLabel}
                    sending={picker.preparing}
                    onSend={() => sendPick()}
                    onEdit={id => openEditor('grid', id)}
                    editDisabled={picker.preparing || !picker.picked.some(isEditable)}
                    grouped={grouping.grouped}
                    onGroupedChange={grouping.setGrouped}
                    notice={limitedNotice}
                    labels={{
                        camera: t('chat.attach.camera'),
                        close: t('chat.attach.viewerClose'),
                        photo: position => t('chat.attach.gridPhoto', { position }),
                        video: position => t('chat.attach.gridVideo', { position }),
                        remove: position => t('chat.attach.removePicked', { position }),
                        edit: t('chat.attach.edit.open'),
                        grouped: t('chat.attach.grouped'),
                        select: position => t('chat.attach.edit.select', { position }),
                        edited: t('chat.attach.edit.edited'),
                    }}
                />
            )}
            {inGrid && (
                <PhotoEditor
                    open={editorVisible}
                    items={editorItems}
                    index={editorAt}
                    onIndexChange={setEditorIndex}
                    onEditChange={picker.setEdit}
                    onCancel={cancelEditor}
                    onDone={leaveEditor}
                    onSend={sendFromEditor}
                    sendLabel={sendLabel}
                    sending={picker.preparing}
                    labels={{
                        title: t('chat.attach.edit.title'),
                        close: t('chat.attach.edit.close'),
                        done: t('chat.attach.edit.done'),
                        crop: t('chat.attach.edit.crop'),
                        rotateLeft: t('chat.attach.edit.rotateLeft'),
                        flip: t('chat.attach.edit.flip'),
                        reset: t('chat.attach.edit.reset'),
                        cancel: t('chat.attach.edit.cancel'),
                        apply: t('chat.attach.edit.apply'),
                        aspects: aspectLabels,
                        notEditable: t('chat.attach.edit.notEditable'),
                        loading: t('chat.attach.edit.loading'),
                        failed: t('chat.attach.edit.failed'),
                        counter: (position, total) => t('chat.attach.edit.counter', { position, total }),
                        thumbnail: position => t('chat.attach.edit.thumbnail', { position }),
                    }}
                />
            )}
            <AlertDialog
                open={discardOpen && editorVisible}
                onOpenChange={setDiscardOpen}
                title={t('chat.attach.edit.discard.title')}
                description={t('chat.attach.edit.discard.description')}
                cancelLabel={t('chat.attach.edit.discard.keep')}
                confirmLabel={t('chat.attach.edit.discard.confirm')}
                destructive
                onConfirm={discardEdits}
            />
            <AlertDialog
                open={permission.open}
                onOpenChange={open => setPermission(current => ({ ...current, open }))}
                title={t(
                    permission.kind === 'camera'
                        ? 'chat.attach.permission.cameraTitle'
                        : 'chat.attach.permission.photosTitle'
                )}
                description={t('chat.attach.permission.description')}
                cancelLabel={t('chat.attach.permission.cancel')}
                confirmLabel={t('chat.attach.permission.settings')}
                onConfirm={() => {
                    setPermission(current => ({ ...current, open: false }));
                    appBridge.openSettings();
                }}
            />
            <AudioSendSheet
                open={audioSheetOpen}
                onOpenChange={setAudioSheetOpen}
                items={(audioToSend ?? NO_SOURCES).map((source, at) => ({
                    key: String(at),
                    name: source.name,
                    meta: formatAudioMeta(audioDurations.get(source), source.size) || undefined,
                }))}
                onRemove={key => {
                    const next = (audioToSend ?? []).filter((_, at) => String(at) !== key);
                    if (next.length) setAudioToSend(next);
                    else setAudioSheetOpen(false);
                }}
                onCancel={() => setAudioSheetOpen(false)}
                onSend={() => {
                    setAudioSheetOpen(false);
                    sendAudio(audioToSend ?? []);
                }}
                title={t('chat.attach.audioSend.title', { count: audioToSend?.length ?? 0 })}
                sendLabel={t('chat.attach.audioSend.send', { count: audioToSend?.length ?? 0 })}
                cancelLabel={t('chat.attach.audioSend.cancel')}
                removeLabel={name => t('chat.attach.removeFile', { name })}
            />
            <UnsendableFilesDialog
                open={!!unsendable}
                onOpenChange={open => !open && setUnsendable(null)}
                title={t('chat.attach.unsendable.title')}
                description={t('chat.attach.unsendable.description')}
                items={unsendable?.refused ?? []}
                restCount={unsendable?.rest.length ?? 0}
                onCancel={() => setUnsendable(null)}
                onSendRest={() => {
                    const rest = unsendable?.rest ?? [];
                    setUnsendable(null);
                    proceedWithPick(rest);
                }}
                onConfirm={() => setUnsendable(null)}
                cancelLabel={t('chat.attach.audioSend.cancel')}
                sendRestLabel={t('chat.attach.unsendable.sendRest', { count: unsendable?.rest.length ?? 0 })}
                confirmLabel={t('chat.attach.unsendable.ok')}
            />
        </>
    );

    return {
        button,
        strip,
        overlays,
        panelOpen,
        sendReady,
        sendPicked,
        closePanel: slot.handOver,
    };
};
