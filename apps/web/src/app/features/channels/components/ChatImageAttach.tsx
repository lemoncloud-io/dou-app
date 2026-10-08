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
    AttachPanel,
    AttachSourceSheet,
    ComposerAttachButton,
    PhotoEditor,
    PhotoGridSheet,
    RecentPhotoStrip,
    SelectedPhotoStrip,
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
import { useAttachPanelSlot } from '../hooks/useAttachPanelSlot';
import { usePhotoGridColumns } from '../hooks/usePhotoGridColumns';
import { editsDiffer, usePhotoPicker, type PhotoPicker } from '../hooks/usePhotoPicker';
import { usePhotoSendGrouping } from '../hooks/usePhotoSendGrouping';
import { albumAccept, DOCUMENT_ACCEPT, isAppleTouchWebKit, rejectionKey } from '../utils/attachSources';

const PHOTO_ACCEPT = CHAT_IMAGE_TYPES.join(',');

/** One empty pick for the row above the field, so an idle composer hands it the same array each render. */
const NO_PHOTOS: PhotoItem[] = [];

/**
 * How long after a tap the page may still open its own file input. iOS WebKit lets `click()` open a
 * picker only within about a second of the gesture, and a shell without the attachment picker says so
 * in one bridge round trip (tens of milliseconds). Past this the input would silently not open, so the
 * user is asked to tap again — by then the page knows, and the next tap opens it at once.
 */
export const INPUT_CLICK_WINDOW_MS = 800;

interface UseChatImageAttachInput {
    /**
     * Sends the accepted files as one message, or with `separately` as one message each, with
     * `content` as the caption — `useSendImages().sendImages`.
     */
    sendImages: (files: ChatAttachmentSource[], options?: runtime.data.SendImagesOptions) => Promise<void>;
    /** Same lock as the composer: nobody to send to, or a message being edited. */
    disabled?: boolean;
    /** The composer's textarea, so opening the panel can drop the keyboard it would otherwise keep. */
    inputRef?: RefObject<HTMLTextAreaElement | null>;
    /**
     * The composer's bar, padded by `COMPOSER_PADDING_BOTTOM`: the panel's slot writes its share of that
     * padding on it, at once or frame by frame with the panel's slide (`useAttachPanelSlot`).
     */
    composerRef?: RefObject<HTMLElement | null>;
    /**
     * Told `true` as the panel's slide starts moving the composer and `false` once it has stopped, so
     * the page can keep its list in step without a render per frame.
     */
    onComposerSlide?: (sliding: boolean) => void;
    /**
     * Hands back a caption that went nowhere: nothing in the pick it was sent with could be sent. The
     * page cleared its field at the press, so it can put the text back.
     */
    onUnsentText?: (text: string) => void;
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
    /**
     * The pick waiting for the composer's send button, as a row of small thumbnails — render it inside
     * the composer, directly above its field, and keep rendering it: it is empty while there is
     * nothing to show there (nothing is picked, the panel is open and its recent row shows every picked
     * item, or the composer is locked), and it needs to stay mounted to fold itself away. Null only
     * where the in-app pick does not exist.
     */
    strip: ReactNode;
    /**
     * The panel, the pickers and the hidden inputs — render once, inside the page's positioned
     * full-height container: the panel lays itself along that container's bottom edge.
     */
    overlays: ReactNode;
    /** Whether the attach panel is open, in the keyboard's place under the composer. */
    panelOpen: boolean;
    /**
     * Something is picked — shown in the open panel, above the composer, or both: the composer's send
     * button sends it, typed text or not.
     */
    sendReady: boolean;
    /**
     * Sends the pick with `text` as its caption, and closes the panel if it is open. False when there
     * was nothing to send — the page then sends its text as usual.
     */
    sendPicked: (text: string) => boolean;
    /**
     * The composer's field took focus: the keyboard takes the panel's place (`useAttachPanelSlot`). The
     * pick stays, in `strip`.
     */
    closePanel: () => void;
}

/**
 * The composer's attach flow: the button in the input, the panel it opens in the keyboard's place, and
 * the pickers behind the panel's entries. Picked files are judged here — format, size, a photo tapped
 * twice, the per-message limit — and what passes goes to `sendImages` at once: from the file inputs,
 * the camera and the app's own picker there is no tray and no confirmation, the pick IS the send.
 *
 * The in-app pick is the one that waits for a send button. The panel's recent row and the grid behind
 * it pick into one list; while something is picked the composer's send button sends it, with whatever
 * is typed as its caption, and the grid's own button sends it without one. Before either is pressed
 * the picked photos can be cropped, turned and mirrored in a full-screen editor over the grid, and the
 * grid's checkbox chooses between one message for the whole pick (the default, remembered per device)
 * and one message each. All of it is the in-app pick's alone: every other path sends as it always did.
 *
 * The panel stands in for the keyboard: it opens at the last keyboard height seen, the composer stays
 * above it, and focusing the field hands its place back to the keyboard — the two trade places without
 * moving the composer (`useAttachPanelSlot`). That keeps the pick — the
 * field is where a caption is typed — and the pick stays on screen: a row of small thumbnails directly
 * above the composer's field (`strip`), where each can be removed or opened in the editor, and the
 * send button stays live for it. Photos never wait out of sight for a button that would send them.
 * × and Escape (Android back) dismiss the panel, and the pick with it.
 *
 * Two ways to pick photos, and the shell decides which:
 * - **The in-app pick**, in an app that has the photo-library bridge: recent photos in the panel, the
 *   full grid behind "see all" and behind the photos entry. Opening the panel asks the shell once for
 *   the newest photos, and that answer is how the page learns the bridge is there.
 * - **The page's own file input** everywhere else — a browser, and an app built before the bridge.
 *   The app's WebView hands a file input to the OS chooser (the profile and channel photo fields
 *   already rely on it) and it returns real bytes, which that older app's own photo bridge does not.
 *
 * The camera entry is a capturing file input in every shell: it opens the camera directly and needs
 * nothing from the app.
 *
 * The files entry opens a sheet — choose from the album (photos and videos) or from files
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
    composerRef,
    onComposerSlide,
    onUnsentText,
    picker: injected,
    shellPicker = shellAttachmentPicker,
    now = Date.now,
}: UseChatImageAttachInput): ChatImageAttach => {
    const { t } = useTranslation();
    const slot = useAttachPanelSlot({ inputRef, composerRef, onComposerSlide });
    const { hide: hidePanel } = slot;
    const [permissionOpen, setPermissionOpen] = useState(false);
    const [sourceOpen, setSourceOpen] = useState(false);
    // A probe asked and not answered yet. Its answer is what `supported` turns into, but a probe that
    // fails on the way leaves `supported` unknown, and the panel should stop waiting for it all the same.
    const [probing, setProbing] = useState(false);
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
    const panelOpen = slot.open && !disabled;
    const sendReady = picker.picked.length > 0 && !picker.preparing && !disabled;

    // The editor over the pick, opened from the grid or from the row above the composer. `editsAtOpen`
    // is what ✕ goes back to: the edits made since the editor opened are the ones it throws away.
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorOver, setEditorOver] = useState<'grid' | 'composer'>('grid');
    const [editorIndex, setEditorIndex] = useState(0);
    const [discardOpen, setDiscardOpen] = useState(false);
    const editsAtOpen = useRef<ReadonlyMap<string, PhotoEdit>>(new Map());
    const editorVisible = editorOpen && !disabled && (editorOver === 'composer' || picker.gridOpen);
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
                caption = '',
            }: {
                refusedByShell?: AttachmentPick['refused'];
                photosOnly?: boolean;
                /** Edited photos the grid could not draw — refused under their own notice. */
                editFailed?: number;
                /** The grid's "one message each". */
                separately?: boolean;
                /** What was typed when the composer's send button sent the pick. */
                caption?: string;
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
            if (accepted.length === 0) {
                // The caption's only way out was this pick; it goes back to the field instead.
                if (caption) onUnsentText?.(caption);
                return;
            }
            const options: runtime.data.SendImagesOptions = {};
            // A single item is the same message either way, so it goes exactly as any other pick does.
            if (separately && accepted.length > 1) options.separately = true;
            if (caption) options.content = caption;
            const sending =
                options.separately || options.content ? sendImages(accepted, options) : sendImages(accepted);
            sending.catch(() => toast({ title: t('chat.attach.sendFailed'), variant: 'destructive' }));
        },
        [sendImages, onUnsentText, t]
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

    // A lock that lands while the panel is up (a message being edited) closes it, rather than leaving
    // it to come back when the lock lifts. Before paint, so the panel and the composer leave together.
    useLayoutEffect(() => {
        if (disabled) hidePanel();
    }, [disabled, hidePanel]);

    /** × and Escape: the person is done attaching, so the pick goes too. */
    const dismissPanel = () => {
        hidePanel();
        picker.clearPicked();
    };

    const togglePanel = () => {
        if (panelOpen) {
            dismissPanel();
            return;
        }
        // Before the blur below: whether the keyboard is up decides how the panel arrives.
        slot.show();
        // The composer keeps the caret through taps on its own chrome, this button included — so the
        // keyboard stays up unless it is dropped here. With it up, the panel is already in place behind
        // it, and the keyboard sliding away is what reveals it.
        inputRef?.current?.blur();
        // Asked on every open, not once: the library changes while the app is away, and the answer
        // is also how an unknown shell is learned. Only that first answer has the recent row waiting.
        if (picker.supported === null) {
            setProbing(true);
            void picker.probe().finally(() => setProbing(false));
        } else if (picker.supported) {
            void picker.probe();
        }
    };

    // Close first, then open the picker: the OS chooser covers the page, and what it picks is sent at
    // once — the panel has nothing left to do. The panel's own pick stays for its next opening.
    const pickFrom = (ref: RefObject<HTMLInputElement | null>) => () => {
        hidePanel();
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
        hidePanel();
        setSourceOpen(true);
    };

    // The grid opens over the panel and closes back onto it, on the same pick.
    const openGrid = () => {
        if (picker.access === 'denied') {
            setPermissionOpen(true);
            return;
        }
        picker.openGrid();
    };

    const toggleRecent = (id: string) => {
        const photo = picker.recent.find(item => item.id === id);
        if (photo) picker.toggle(photo);
    };

    // Judged like any pick, since the grid now lists videos too; what the shell would not keep is
    // reported the way its own picker's refusals are. The grouping is read at the press: what the box
    // says then is what the person chose. Whichever button sent it, the panel the pick lives in closes.
    const sendPick = (caption = '') => {
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
                })
            )
            .catch(() => {
                toast({ title: t('chat.attach.sendFailed'), variant: 'destructive' });
                if (caption) onUnsentText?.(caption);
            });
    };

    // The composer's send button, with the field's text as the caption — from the open panel or from
    // the row above the composer alike. The grid's and the editor's buttons send the photos alone and
    // leave the text where it is.
    const sendPicked = (text: string): boolean => {
        if (!sendReady) return false;
        sendPick(text.trim());
        return true;
    };

    /** A video, and a photo read and found to be a GIF, are shown in the editor but not edited. */
    const isEditable = (item: PhotoItem) => item.kind !== 'video' && picker.editAssets.get(item.id)?.editable !== false;

    /**
     * Opens the editor at a tapped strip photo, or — from the grid's Edit button — at the first editable
     * one. `over` is where it closes back to: the grid, or the composer and the row above its field.
     */
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

    // "완료" and ✕ go back to where the editor was opened. Over the composer, the bytes it read go as it
    // closes, as they go when the grid closes: the pick waits there for as long as a caption takes.
    const leaveEditor = () => {
        closeEditor();
        if (editorOver === 'composer') picker.releaseBytes();
    };

    // ✕ keeps nothing made since the editor opened, so it asks first — but only when that is something.
    const cancelEditor = () => {
        if (editsDiffer(editsAtOpen.current, picker.edits)) setDiscardOpen(true);
        else leaveEditor();
    };

    const discardEdits = () => {
        picker.restoreEdits(editsAtOpen.current);
        leaveEditor();
    };

    // The editor's send is the grid's: opened over the grid it closes onto it, which says it is
    // preparing; opened over the composer, the row there says so. The bytes it read go to the send.
    const sendFromEditor = () => {
        closeEditor();
        sendPick();
    };

    // An editor opened over the grid lives on it: once the grid has gone — a send finished, the sheet
    // was closed — there is nothing for it to show. One opened over the composer has no grid under it.
    useEffect(() => {
        if (!picker.gridOpen && editorOver === 'grid') closeEditor();
    }, [picker.gridOpen, editorOver]);

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
            open={panelOpen}
            onClick={togglePanel}
            disabled={disabled}
            label={panelOpen ? t('chat.attach.close') : t('chat.attach.open')}
        />
    );

    // What the panel's recent row shows: the newest items, where the library can be read and was let.
    const recentItems = inGrid && picker.access !== 'denied' ? picker.recent : NO_PHOTOS;
    // In the app, the first opening on a page asks the library whether it is there at all, and the panel
    // draws before it answers. The row stands there in skeleton tiles meanwhile, so the panel's entries
    // under it are where they will stay once the photos come; told there is no library, the row closes
    // and they rise with it. Kept in the panel for that, as long as the app may have a library, even
    // with nothing to draw — it draws nothing then. A browser never has one, and never gets the row.
    const recentPending = picker.supported === null && probing;
    const recent =
        isNative() || inGrid ? (
            <RecentPhotoStrip
                title={t('chat.attach.recentTitle')}
                seeAllLabel={t('chat.attach.seeAll')}
                onSeeAll={openGrid}
                photos={recentItems}
                loading={recentPending}
                picked={picker.picked.map(item => item.id)}
                onToggle={toggleRecent}
                max={IMAGE_MESSAGE_SLOT_MAX}
                photoLabel={position => t('chat.attach.recentPhoto', { position })}
                videoLabel={position => t('chat.attach.recentVideo', { position })}
            />
        ) : undefined;

    // The pick above the composer whenever some of it is out of sight — while the panel is closed (for
    // the keyboard, most often), and while it is open with a pick its recent row does not hold, one made
    // in the grid past the newest items. Still on screen, still the send button's: nothing goes unseen.
    // While the open panel's row holds every picked item, the row is where the pick shows.
    const removePicked = (id: string) => {
        const item = picker.picked.find(photo => photo.id === id);
        if (item) picker.toggle(item);
    };
    const inRecentRow = new Set(panelOpen ? recentItems.map(item => item.id) : []);
    const stripShown = !disabled && picker.picked.some(item => !inRecentRow.has(item.id));
    // Mounted whenever the in-app pick exists, and handed an empty pick while there is nothing to show:
    // the row folds itself away, which it can only do while it is still here. The 8px between it and
    // the field is the row's own margin, inside what it opens and closes, so the composer grows and
    // shrinks in one movement — the same space on this wrapper would move on a timing of its own.
    const strip = inGrid ? (
        <div
            // The field keeps the caret through a tap on the row, as it does through the composer's own
            // chrome: removing a photo while typing its caption must not drop the keyboard and the
            // composer with it. `mousedown` too — on iOS WebKit the focus moves there.
            onPointerDown={event => event.preventDefault()}
            onMouseDown={event => event.preventDefault()}
            // While the send reads the pick the row stays, faded and inert: the field has already
            // cleared, and a video coming down from iCloud can take a while to become a message.
            aria-busy={(stripShown && picker.preparing) || undefined}
            className={`transition-opacity${picker.preparing ? ' pointer-events-none opacity-50' : ''}`}
        >
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
            <AttachPanel
                ref={slot.panel.ref}
                // The slot moves it, frame by frame with the composer (`useAttachPanelSlot`).
                motion="external"
                open={slot.panel.open}
                height={slot.panel.height}
                enter={slot.panel.enter}
                exit={slot.panel.exit}
                recent={recent}
                onPhoto={inGrid ? openGrid : pickFrom(libraryRef)}
                onCamera={pickFrom(cameraRef)}
                onFile={openSources}
                onClose={dismissPanel}
                labels={{
                    title: t('chat.attach.menuTitle'),
                    photo: t('chat.attach.photo'),
                    camera: t('chat.attach.camera'),
                    file: t('chat.attach.file'),
                }}
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
                        hidePanel();
                        cameraRef.current?.click();
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
