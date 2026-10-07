import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import type { AttachmentPickSource } from '@chatic/app-messages';
import type { runtime } from '@chatic/app-runtime';
import { isNative } from '@chatic/bridges';
import {
    CHAT_IMAGE_TYPES,
    type ChatAttachmentJudgement,
    type ChatAttachmentSource,
    IMAGE_MESSAGE_SLOT_MAX,
    judgeChatAttachments,
    judgeChatImages,
} from '@chatic/data';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    AlertDialog,
    AttachMenuSheet,
    AttachSourceSheet,
    ComposerAttachButton,
    PhotoEditor,
    PhotoGridSheet,
    RecentPhotoStrip,
    type CropAspect,
    type PhotoEdit,
    type PhotoEditorItem,
    type PhotoItem,
} from '@chatic/web-ui-kit';

import { appBridge } from '../../../bridge/appBridge';
import {
    attachmentPicker as shellAttachmentPicker,
    type AttachmentPick,
    type AttachmentPicker,
} from '../../../bridge/attachmentPicker';
import { usePhotoGridColumns } from '../hooks/usePhotoGridColumns';
import { editsDiffer, usePhotoPicker, type PhotoPicker } from '../hooks/usePhotoPicker';
import { usePhotoSendGrouping } from '../hooks/usePhotoSendGrouping';
import { albumAccept, DOCUMENT_ACCEPT, isAppleTouchWebKit, rejectionKey } from '../utils/attachSources';

const PHOTO_ACCEPT = CHAT_IMAGE_TYPES.join(',');

/**
 * How long after a tap the page may still open its own file input. iOS WebKit lets `click()` open a
 * picker only within about a second of the gesture, and a shell without the attachment picker says so
 * in one bridge round trip (tens of milliseconds). Past this the input would silently not open, so the
 * user is asked to tap again — by then the page knows, and the next tap opens it at once.
 */
export const INPUT_CLICK_WINDOW_MS = 800;

interface UseChatImageAttachInput {
    /**
     * Sends the accepted files as one message, or with `separately` as one message each —
     * `useSendImages().sendImages`.
     */
    sendImages: (files: ChatAttachmentSource[], options?: runtime.data.SendImagesOptions) => Promise<void>;
    /** Same lock as the composer: nobody to send to, or a message being edited. */
    disabled?: boolean;
    /** The composer's textarea, so opening the menu can drop the keyboard it would otherwise keep. */
    inputRef?: RefObject<HTMLTextAreaElement | null>;
    /** Test seam — the in-app picker's state. */
    picker?: PhotoPicker;
    /** Test seam — the app's video and document picker. */
    shellPicker?: AttachmentPicker;
    /** Test seam — the clock the tap window is measured with. */
    now?: () => number;
}

interface ChatImageAttach {
    /** For the composer's leading slot. */
    button: ReactNode;
    /** The menu, the pickers and the hidden inputs — render once, anywhere in the page. */
    overlays: ReactNode;
}

/**
 * The composer's attach flow: the button in the input, the menu it opens, and the pickers behind the
 * menu's entries. Picked files are judged here — format, size, a photo tapped twice, the per-message
 * limit — and what passes goes to `sendImages` at once: from the file inputs, the camera and the app's
 * own picker there is no tray and no confirmation, the pick IS the send.
 *
 * The in-app grid is the one place a pick waits for a send button, since it already had one. Before
 * it is pressed the picked photos can be cropped, turned and mirrored in a full-screen editor over the
 * pick, and the grid's checkbox chooses between one message for the whole pick (the default,
 * remembered per device) and one message each. Both are the grid's alone: every other path sends as
 * it always did.
 *
 * Two ways to pick photos, and the shell decides which:
 * - **The in-app grid**, in an app that has the photo-library bridge: recent photos in the menu, the
 *   full grid behind "see all" and behind the photos entry. Opening the menu asks the shell once for
 *   the newest photos, and that answer is how the page learns the bridge is there.
 * - **The page's own file input** everywhere else — a browser, and an app built before the bridge.
 *   The app's WebView hands a file input to the OS chooser (the profile and channel photo fields
 *   already rely on it) and it returns real bytes, which that older app's own photo bridge does not.
 *
 * The camera entry is a capturing file input in every shell: it opens the camera directly and needs
 * nothing from the app.
 *
 * The files entry opens a second sheet — choose from the album (photos and videos) or from files
 * (documents). In an app that has the attachment picker both open the OS pickers through the shell,
 * which keeps the videos and documents and hands back their addresses: a large video never passes
 * through the page. Everywhere else they open the page's own inputs, whose files the page uploads
 * itself. The shell is asked at the tap, since the message itself opens its picker, and a shell
 * without one answers in time for the page input to open in the same tap.
 */
export const useChatImageAttach = ({
    sendImages,
    disabled = false,
    inputRef,
    picker: injected,
    shellPicker = shellAttachmentPicker,
    now = Date.now,
}: UseChatImageAttachInput): ChatImageAttach => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [permissionOpen, setPermissionOpen] = useState(false);
    const [sourceOpen, setSourceOpen] = useState(false);
    const libraryRef = useRef<HTMLInputElement>(null);
    const cameraRef = useRef<HTMLInputElement>(null);
    const albumRef = useRef<HTMLInputElement>(null);
    const filesRef = useRef<HTMLInputElement>(null);
    const appleTouch = isAppleTouchWebKit();
    const gridColumns = usePhotoGridColumns();
    const own = usePhotoPicker({
        max: IMAGE_MESSAGE_SLOT_MAX,
        allTitle: t('chat.attach.recentTitle'),
        columns: gridColumns.columns,
    });
    const picker = injected ?? own;
    const inGrid = picker.supported === true;
    const grouping = usePhotoSendGrouping();

    // The editor over the grid's pick. `editsAtOpen` is what ✕ goes back to: the edits made since the
    // editor opened are the ones it throws away.
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorIndex, setEditorIndex] = useState(0);
    const [discardOpen, setDiscardOpen] = useState(false);
    const editsAtOpen = useRef<ReadonlyMap<string, PhotoEdit>>(new Map());
    const editorVisible = editorOpen && picker.gridOpen && !disabled;
    const editorAt = Math.min(editorIndex, Math.max(0, picker.picked.length - 1));

    /**
     * Judges a pick and sends what passes — shared by the file inputs, the grid and the app's picker.
     * What the shell would not copy is reported first, under the same one-notice rule. The page judges
     * the rest again either way rather than trust the shell. The photo entries take photos only, whatever
     * a system picker let through.
     */
    const send = useCallback(
        (
            items: ChatAttachmentSource[],
            {
                refusedByShell = [],
                photosOnly = false,
                editFailed = 0,
                separately = false,
            }: {
                refusedByShell?: AttachmentPick['refused'];
                photosOnly?: boolean;
                /** Edited photos the grid could not draw — refused under their own notice. */
                editFailed?: number;
                /** The grid's "one message each". */
                separately?: boolean;
            } = {}
        ) => {
            const { accepted, rejected }: ChatAttachmentJudgement<ChatAttachmentSource> = photosOnly
                ? (() => {
                      const judged = judgeChatImages(items as File[], IMAGE_MESSAGE_SLOT_MAX);
                      return {
                          accepted: judged.accepted,
                          // The image-only judgement names no kind; a photo's limit is the one it met.
                          rejected: judged.rejected.map(({ file, reason }) =>
                              reason === 'too-large'
                                  ? { item: file, reason, kind: 'image' as const }
                                  : { item: file, reason }
                          ),
                      };
                  })()
                : judgeChatAttachments(items, IMAGE_MESSAGE_SLOT_MAX);
            // One notice per pick, for the first reason met — a list of every refused file is noise. A
            // photo whose edit could not be drawn comes first: it was picked and worked on, and now it
            // is the one thing missing from what was sent.
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
            if (accepted.length === 0) return;
            // A single item is the same message either way, so it goes exactly as any other pick does.
            const sending =
                separately && accepted.length > 1 ? sendImages(accepted, { separately: true }) : sendImages(accepted);
            sending.catch(() => toast({ title: t('chat.attach.sendFailed'), variant: 'destructive' }));
        },
        [sendImages, t]
    );

    const pickedFrom = useCallback(
        (photosOnly: boolean) => (event: ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(event.target.files ?? []);
            // Cleared at once so picking the same photo again still fires a change.
            event.target.value = '';
            send(files, { photosOnly });
        },
        [send]
    );
    const handlePhotosPicked = pickedFrom(true);
    const handleAttachmentsPicked = pickedFrom(false);

    const openMenu = () => {
        // The composer keeps the caret through taps on its own chrome, this button included — so the
        // keyboard stays up unless it is dropped here, and the sheet would open under it.
        inputRef?.current?.blur();
        const opening = !open;
        setOpen(opening);
        // Asked on every open, not once: the library changes while the app is away, and the answer
        // is also how an unknown shell is learned.
        if (opening && picker.supported !== false) void picker.probe();
    };

    // Close first, then open the picker: the OS chooser covers the page, and a sheet still open
    // behind it is what the user comes back to otherwise.
    const pickFrom = (ref: RefObject<HTMLInputElement | null>) => () => {
        setOpen(false);
        ref.current?.click();
    };

    /**
     * Opens the app's picker for this source, or the page's input when the shell has none. Once the page
     * knows the shell has none it opens the input straight from the tap.
     */
    const pickFromShell = (source: AttachmentPickSource, ref: RefObject<HTMLInputElement | null>) => () => {
        setSourceOpen(false);
        if (shellPicker.isUnsupported()) {
            ref.current?.click();
            return;
        }
        const tappedAt = now();
        shellPicker
            .pick({ source, selectionLimit: IMAGE_MESSAGE_SLOT_MAX })
            .then(picked => {
                if (picked) {
                    send(picked.items, { refusedByShell: picked.refused });
                    return;
                }
                if (now() - tappedAt <= INPUT_CLICK_WINDOW_MS) ref.current?.click();
                else toast({ title: t('chat.attach.tapAgain') });
            })
            .catch(error => {
                // A second tap while the picker opens or copies: the first one is still under way.
                if ((error as { code?: string })?.code === 'BUSY') return;
                toast({ title: t('chat.attach.sendFailed'), variant: 'destructive' });
            });
    };

    const openSources = () => {
        setOpen(false);
        setSourceOpen(true);
    };

    const openGrid = (preselect?: { id: string; src: string }) => {
        setOpen(false);
        if (picker.access === 'denied') {
            setPermissionOpen(true);
            return;
        }
        picker.openGrid(preselect);
    };

    // Judged like any pick, since the grid now lists videos too; what the shell would not keep is
    // reported the way its own picker's refusals are. The grouping is read at the press: what the box
    // says then is what the person chose.
    const sendPicked = () => {
        if (picker.preparing) return;
        const separately = !grouping.grouped;
        picker
            .takePicked()
            .then(picked =>
                send(picked.items, { refusedByShell: picked.refused, editFailed: picked.editFailed, separately })
            )
            .catch(() => toast({ title: t('chat.attach.sendFailed'), variant: 'destructive' }));
    };

    /** A video, and a photo read and found to be a GIF, are shown in the editor but not edited. */
    const isEditable = (item: PhotoItem) => item.kind !== 'video' && picker.editAssets.get(item.id)?.editable !== false;

    /** Opens the editor at a tapped strip photo, or — from the Edit button — at the first editable one. */
    const openEditor = (id?: string) => {
        if (picker.preparing || picker.picked.length === 0) return;
        const at =
            id !== undefined ? picker.picked.findIndex(item => item.id === id) : picker.picked.findIndex(isEditable);
        setEditorIndex(Math.max(0, at));
        editsAtOpen.current = picker.edits;
        setDiscardOpen(false);
        setEditorOpen(true);
    };

    const closeEditor = () => {
        setEditorOpen(false);
        setDiscardOpen(false);
    };

    // ✕ keeps nothing made since the editor opened, so it asks first — but only when that is something.
    const cancelEditor = () => {
        if (editsDiffer(editsAtOpen.current, picker.edits)) setDiscardOpen(true);
        else closeEditor();
    };

    const discardEdits = () => {
        picker.restoreEdits(editsAtOpen.current);
        closeEditor();
    };

    // The editor's send is the grid's: the editor closes onto the grid, which says it is preparing.
    const sendFromEditor = () => {
        closeEditor();
        sendPicked();
    };

    // The editor lives on the grid: once the grid has gone — a send finished, the sheet was closed —
    // there is nothing for it to show.
    useEffect(() => {
        if (!picker.gridOpen) closeEditor();
    }, [picker.gridOpen]);

    // The photo on screen is read first, then the ones either side, so a swipe usually lands on one
    // that is ready. Asking again for what is read or on its way costs nothing. Once the editor closes,
    // what was still waiting is dropped: each read holds a whole photo in page memory, and one the
    // editor will not show is the send's to make, in its turn. A read under way finishes.
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
            open={open}
            onClick={openMenu}
            disabled={disabled}
            label={open ? t('chat.attach.close') : t('chat.attach.open')}
        />
    );

    const recent =
        inGrid && picker.access !== 'denied' ? (
            <RecentPhotoStrip
                title={t('chat.attach.recentTitle')}
                seeAllLabel={t('chat.attach.seeAll')}
                onSeeAll={() => openGrid()}
                photos={picker.recent}
                onSelect={id => openGrid(picker.recent.find(p => p.id === id))}
                photoLabel={position => t('chat.attach.recentPhoto', { position })}
                videoLabel={position => t('chat.attach.recentVideo', { position })}
            />
        ) : undefined;

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
        // The editor draws the copy only with the size its edit is measured in; until then, the preview.
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

    // A ratio reads the same in every language — and i18next would take its colon for a namespace.
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
                accept={DOCUMENT_ACCEPT}
                multiple
                hidden
                onChange={handleAttachmentsPicked}
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
            <AttachMenuSheet
                open={open && !disabled}
                onOpenChange={setOpen}
                title={t('chat.attach.menuTitle')}
                recent={recent}
                onPhoto={inGrid ? () => openGrid() : pickFrom(libraryRef)}
                onCamera={pickFrom(cameraRef)}
                onFile={openSources}
                labels={{ photo: t('chat.attach.photo'), camera: t('chat.attach.camera'), file: t('chat.attach.file') }}
            />
            <AttachSourceSheet
                open={sourceOpen && !disabled}
                onOpenChange={setSourceOpen}
                title={t('chat.attach.source.title')}
                onAlbum={pickFromShell('media', albumRef)}
                onFiles={pickFromShell('document', filesRef)}
                labels={{ album: t('chat.attach.source.album'), files: t('chat.attach.source.files') }}
                // iOS WebKit's own input cannot send videos (it hands them over as QuickTime), so where
                // the page input is what opens, say what would.
                notice={
                    // iOS WebKit's own input gives photos only. Inside the app an update brings the
                    // picker; a browser never gets one.
                    appleTouch && shellPicker.isUnsupported()
                        ? t(isNative() ? 'chat.attach.source.videoNeedsUpdate' : 'chat.attach.source.videoInApp')
                        : undefined
                }
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
                    max={IMAGE_MESSAGE_SLOT_MAX}
                    onCamera={() => {
                        picker.closeGrid();
                        cameraRef.current?.click();
                    }}
                    sendLabel={sendLabel}
                    sending={picker.preparing}
                    onSend={sendPicked}
                    onEdit={openEditor}
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
                    onDone={closeEditor}
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
                open={permissionOpen}
                onOpenChange={setPermissionOpen}
                title={t('chat.attach.permission.photosTitle')}
                description={t('chat.attach.permission.description')}
                cancelLabel={t('chat.attach.permission.cancel')}
                confirmLabel={t('chat.attach.permission.settings')}
                onConfirm={() => {
                    setPermissionOpen(false);
                    appBridge.openSettings();
                }}
            />
        </>
    );

    return { button, overlays };
};
