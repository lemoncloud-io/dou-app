import { useCallback, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { CHAT_IMAGE_TYPES, IMAGE_MESSAGE_SLOT_MAX, judgeChatImages, type ChatImageRejection } from '@chatic/data';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import { AttachMenuSheet, ComposerAttachButton } from '@chatic/web-ui-kit';

const ACCEPT = CHAT_IMAGE_TYPES.join(',');

interface UseChatImageAttachInput {
    /** Sends the accepted files as one message — `useSendImages().sendImages`. */
    sendImages: (files: File[]) => Promise<void>;
    /** Same lock as the composer: nobody to send to, or a message being edited. */
    disabled?: boolean;
    /** The composer's textarea, so opening the menu can drop the keyboard it would otherwise keep. */
    inputRef?: RefObject<HTMLTextAreaElement | null>;
}

interface ChatImageAttach {
    /** For the composer's leading slot. */
    button: ReactNode;
    /** The menu and the hidden inputs — render once, anywhere in the page. */
    overlays: ReactNode;
}

/**
 * The composer's attach flow: the button in the input, the menu it opens, and the pickers behind
 * the menu's entries. Picked files are judged here — format, size, a photo tapped twice, the
 * per-message limit — and what passes goes to `sendImages` at once: there is no tray and no
 * confirmation, the pick IS the send.
 *
 * Every entry is the page's own file input, in the app as much as in a browser. The app's WebView
 * hands a file input to the OS chooser — the profile and channel photo fields already rely on it —
 * and it returns real bytes, which the photo-library bridge of an app built before this feature
 * does not. The camera entry gets its own input with `capture`, so it opens the camera directly;
 * the photos and files entries share one without it, so the album stays reachable.
 */
export const useChatImageAttach = ({
    sendImages,
    disabled = false,
    inputRef,
}: UseChatImageAttachInput): ChatImageAttach => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const libraryRef = useRef<HTMLInputElement>(null);
    const cameraRef = useRef<HTMLInputElement>(null);

    const rejectionText = useCallback(
        (reason: ChatImageRejection) => t(`chat.attach.rejected.${reason}`, { max: IMAGE_MESSAGE_SLOT_MAX }),
        [t]
    );

    const handlePicked = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(event.target.files ?? []);
            // Cleared at once so picking the same photo again still fires a change.
            event.target.value = '';
            if (files.length === 0) return;

            const { accepted, rejected } = judgeChatImages(files, IMAGE_MESSAGE_SLOT_MAX);
            // One notice per pick, for the first reason met — a list of every refused file is noise.
            if (rejected.length > 0) toast({ title: rejectionText(rejected[0].reason) });
            if (accepted.length === 0) return;
            sendImages(accepted).catch(() => toast({ title: t('chat.attach.sendFailed'), variant: 'destructive' }));
        },
        [rejectionText, sendImages, t]
    );

    const openMenu = () => {
        // The composer keeps the caret through taps on its own chrome, this button included — so the
        // keyboard stays up unless it is dropped here, and the sheet would open under it.
        inputRef?.current?.blur();
        setOpen(value => !value);
    };

    // Close first, then open the picker: the OS chooser covers the page, and a sheet still open
    // behind it is what the user comes back to otherwise.
    const pickFrom = (ref: RefObject<HTMLInputElement | null>) => () => {
        setOpen(false);
        ref.current?.click();
    };

    const button = (
        <ComposerAttachButton
            open={open}
            onClick={openMenu}
            disabled={disabled}
            label={open ? t('chat.attach.close') : t('chat.attach.open')}
        />
    );

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
                onPhoto={pickFrom(libraryRef)}
                onCamera={pickFrom(cameraRef)}
                onFile={pickFrom(libraryRef)}
                labels={{ photo: t('chat.attach.photo'), camera: t('chat.attach.camera'), file: t('chat.attach.file') }}
            />
        </>
    );

    return { button, overlays };
};
