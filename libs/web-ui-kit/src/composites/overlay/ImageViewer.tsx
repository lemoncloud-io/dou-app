import * as Dialog from '@radix-ui/react-dialog';

import { IconClose } from '../../resources/icons';

export interface ImageViewerProps {
    /** The image to show. `null` closes the viewer. */
    src: string | null;
    onClose: () => void;
    /** Accessible name of the viewer. Not drawn. */
    title?: string;
    closeLabel?: string;
    /** Fired when the image fails to load — a signed address may have expired. */
    onError?: () => void;
}

/**
 * A chat image, full screen: the original on black, a close button, and a tap anywhere outside the
 * image to leave. One image only — swiping between a message's images, zoom, save and share are not
 * here yet.
 *
 * On `@radix-ui/react-dialog` directly rather than `ui-kit`'s styled `dialog`: that wrapper centres a
 * card with padding and its own close mark, and a full-bleed viewer would spend its whole className
 * undoing it. Focus, escape and the portal are what is wanted from the primitive.
 */
export const ImageViewer = ({ src, onClose, title = 'Photo', closeLabel = 'Close', onError }: ImageViewerProps) => (
    <Dialog.Root open={src !== null} onOpenChange={open => !open && onClose()}>
        <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black" />
            <Dialog.Content
                aria-describedby={undefined}
                onClick={event => {
                    if (event.target === event.currentTarget) onClose();
                }}
                className="fixed inset-0 z-50 flex items-center justify-center outline-none"
            >
                <Dialog.Title className="sr-only">{title}</Dialog.Title>
                {src && (
                    <img
                        src={src}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                        draggable={false}
                        onError={onError}
                    />
                )}
                <Dialog.Close
                    aria-label={closeLabel}
                    className="absolute right-4 top-[calc(var(--safe-top,0px)+12px)] flex size-9 items-center justify-center rounded-full bg-white/20"
                >
                    <IconClose className="size-5 text-white" />
                </Dialog.Close>
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>
);
