import { Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { LiveQrOpenError, LiveQrScanner, type LiveQrOpenFailure } from '../lib/liveQrScanner';

/** How long "this is not a DoU QR" stays up after the last such frame. */
const NOT_OURS_NOTE_MS = 2000;

interface QrScannerSheetProps {
    onCode: (code: string) => void;
    onClose: () => void;
    /** The camera could not be opened; the sheet is done and the caller decides what comes instead. */
    onUnavailable: (reason: LiveQrOpenFailure) => void;
}

/**
 * The approving app's live QR scanner: the back camera full screen, a guide square, and a pairing code
 * the moment one is in view. Mounted only while scanning — unmounting releases the camera.
 */
export const QrScannerSheet = ({ onCode, onClose, onUnavailable }: QrScannerSheetProps) => {
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [ready, setReady] = useState(false);
    const [notOurs, setNotOurs] = useState(false);
    // The camera opens once per mount, so the latest callbacks are read through a ref rather than
    // reopening it whenever the parent renders new ones.
    const callbacks = useRef({ onCode, onClose, onUnavailable });
    callbacks.current = { onCode, onClose, onUnavailable };

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const scanner = new LiveQrScanner();
        let active = true;
        let noteTimer: ReturnType<typeof setTimeout> | undefined;

        scanner
            .start(video, {
                onCode: code => active && callbacks.current.onCode(code),
                onNotOurs: () => {
                    setNotOurs(true);
                    clearTimeout(noteTimer);
                    noteTimer = setTimeout(() => setNotOurs(false), NOT_OURS_NOTE_MS);
                },
            })
            .then(() => active && setReady(true))
            .catch((error: unknown) => {
                if (active) callbacks.current.onUnavailable(error instanceof LiveQrOpenError ? error.reason : 'failed');
            });

        // A backgrounded app loses the camera (iOS suspends it), and coming back to a frozen picture
        // reads as broken; closing hands the person back the screen they were on.
        const onVisibility = () => document.hidden && callbacks.current.onClose();
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            active = false;
            scanner.stop();
            clearTimeout(noteTimer);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex flex-col bg-black pt-safe-top pb-safe-bottom text-white"
            role="dialog"
            aria-modal="true"
            aria-label={t('pairing.approve.scan')}
            data-testid="pairing-qr-scanner"
        >
            <div className="flex justify-end px-3 py-2">
                <button
                    type="button"
                    onClick={() => callbacks.current.onClose()}
                    aria-label={t('common.close')}
                    className="rounded-full p-2"
                    data-testid="pairing-qr-scanner-close"
                >
                    <X size={24} aria-hidden />
                </button>
            </div>
            <div className="relative flex-1 overflow-hidden">
                {/* `playsInline` keeps iOS from handing the stream to its full-screen player. */}
                <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="aspect-square w-[64%] max-w-[280px] rounded-3xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                </div>
                {!ready && (
                    <Loader2
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin"
                        size={28}
                        aria-hidden
                    />
                )}
            </div>
            <p
                className="px-6 py-5 text-center text-[15px] leading-[1.5]"
                role="status"
                data-testid="pairing-qr-scanner-note"
            >
                {notOurs ? t('pairing.approve.scanNotOurs') : t('pairing.approve.scanHint')}
            </p>
        </div>,
        document.body
    );
};
