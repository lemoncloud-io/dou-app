import { useCallback, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { CHAT_IMAGE_TYPES, IMAGE_MESSAGE_SLOT_MAX, judgeChatImages, type ChatImageRejection } from '@chatic/data';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    AlertDialog,
    AttachMenuSheet,
    ComposerAttachButton,
    PhotoGridSheet,
    RecentPhotoStrip,
} from '@chatic/web-ui-kit';

import { appBridge } from '../../../bridge/appBridge';
import { usePhotoPicker, type PhotoPicker } from '../hooks/usePhotoPicker';

const ACCEPT = CHAT_IMAGE_TYPES.join(',');

interface UseChatImageAttachInput {
    /** Sends the accepted files as one message — `useSendImages().sendImages`. */
    sendImages: (files: File[]) => Promise<void>;
    /** Same lock as the composer: nobody to send to, or a message being edited. */
    disabled?: boolean;
    /** The composer's textarea, so opening the menu can drop the keyboard it would otherwise keep. */
    inputRef?: RefObject<HTMLTextAreaElement | null>;
    /** Test seam — the in-app picker's state. */
    picker?: PhotoPicker;
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
 * limit — and what passes goes to `sendImages` at once: there is no tray and no confirmation, the
 * pick IS the send.
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
 * nothing from the app. Files always use the page's input.
 */
export const useChatImageAttach = ({
    sendImages,
    disabled = false,
    inputRef,
    picker: injected,
}: UseChatImageAttachInput): ChatImageAttach => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [permissionOpen, setPermissionOpen] = useState(false);
    const libraryRef = useRef<HTMLInputElement>(null);
    const cameraRef = useRef<HTMLInputElement>(null);
    const own = usePhotoPicker({ max: IMAGE_MESSAGE_SLOT_MAX, allTitle: t('chat.attach.recentTitle') });
    const picker = injected ?? own;
    const inGrid = picker.supported === true;

    const rejectionText = useCallback(
        (reason: ChatImageRejection) => t(`chat.attach.rejected.${reason}`, { max: IMAGE_MESSAGE_SLOT_MAX }),
        [t]
    );

    /** Judges a pick and sends what passes — shared by the file inputs and the grid. */
    const send = useCallback(
        (files: File[]) => {
            if (files.length === 0) return;
            const { accepted, rejected } = judgeChatImages(files, IMAGE_MESSAGE_SLOT_MAX);
            // One notice per pick, for the first reason met — a list of every refused file is noise.
            if (rejected.length > 0) toast({ title: rejectionText(rejected[0].reason) });
            if (accepted.length === 0) return;
            sendImages(accepted).catch(() => toast({ title: t('chat.attach.sendFailed'), variant: 'destructive' }));
        },
        [rejectionText, sendImages, t]
    );

    const handlePicked = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(event.target.files ?? []);
            // Cleared at once so picking the same photo again still fires a change.
            event.target.value = '';
            send(files);
        },
        [send]
    );

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

    const openGrid = (preselect?: { id: string; src: string }) => {
        setOpen(false);
        if (picker.access === 'denied') {
            setPermissionOpen(true);
            return;
        }
        picker.openGrid(preselect);
    };

    const sendPicked = () => {
        picker
            .takePicked()
            .then(send)
            .catch(() => toast({ title: t('chat.attach.sendFailed'), variant: 'destructive' }));
    };

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

    const overlays = (
        <>
            <input
                ref={libraryRef}
                type="file"
                accept={ACCEPT}
                multiple
                hidden
                onChange={handlePicked}
                data-testid="chat-attach-library"
            />
            <input
                ref={cameraRef}
                type="file"
                accept={ACCEPT}
                capture="environment"
                hidden
                onChange={handlePicked}
                data-testid="chat-attach-camera"
            />
            <AttachMenuSheet
                open={open && !disabled}
                onOpenChange={setOpen}
                title={t('chat.attach.menuTitle')}
                recent={recent}
                onPhoto={inGrid ? () => openGrid() : pickFrom(libraryRef)}
                onCamera={pickFrom(cameraRef)}
                onFile={pickFrom(libraryRef)}
                labels={{ photo: t('chat.attach.photo'), camera: t('chat.attach.camera'), file: t('chat.attach.file') }}
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
                    photos={picker.photos}
                    picked={picker.picked}
                    onToggle={picker.toggle}
                    max={IMAGE_MESSAGE_SLOT_MAX}
                    onCamera={() => {
                        picker.closeGrid();
                        cameraRef.current?.click();
                    }}
                    hasMore={picker.hasMore}
                    onLoadMore={picker.loadMore}
                    sendLabel={t('chat.attach.send', { count: picker.picked.length })}
                    onSend={sendPicked}
                    notice={limitedNotice}
                    labels={{
                        camera: t('chat.attach.camera'),
                        close: t('chat.attach.viewerClose'),
                        photo: position => t('chat.attach.gridPhoto', { position }),
                        remove: position => t('chat.attach.removePicked', { position }),
                    }}
                />
            )}
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
