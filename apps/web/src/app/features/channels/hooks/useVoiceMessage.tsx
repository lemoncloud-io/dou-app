import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic } from 'lucide-react';

import type { OnAudioRecordingEndedPayload } from '@chatic/bridge-messages';
import type { ChatAttachmentSource } from '@chatic/data';
import { cn } from '@chatic/ui-kit';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import { AlertDialog, formatVideoDuration } from '@chatic/web-ui-kit';

import { appBridge } from '../../../bridge/appBridge';
import { toShellFile } from '../../../bridge/attachmentPicker';
import { audioRecorder as shellAudioRecorder, useCanRecordAudio } from '../../../bridge/audioRecorder';
import { haptics } from '../../../bridge/haptics';

import { pauseInlineAudio } from './useInlineAudio';

/** How far left the finger has to slide from where it pressed for the release to throw the recording away. */
export const VOICE_CANCEL_SLIDE_PX = 72;

/**
 * A start that answered later than this waited on the OS permission prompt, not on a round trip: a
 * release before it came is the person answering the prompt, not a short press.
 */
const PROMPT_ANSWER_MS = 1_000;

type Phase = 'idle' | 'starting' | 'recording' | 'stopping';

/**
 * Calls `onUnmount` when the microphone leaves the page while it may be held: typing a letter swaps it
 * for the send button mid-press, and the release it would have heard never comes.
 */
const UnmountWatch = ({ onUnmount }: { onUnmount: () => void }) => {
    const latest = useRef(onUnmount);
    latest.current = onUnmount;
    useEffect(() => () => latest.current(), []);
    return null;
};

interface UseVoiceMessageInput {
    /** Sends the recording as a message of its own — `useSendImages().sendImages`. */
    sendImages: (files: ChatAttachmentSource[]) => Promise<void>;
    /** The composer's lock: nobody to send to, a message being edited, the input lock. */
    disabled?: boolean;
    /** The conversation the composer is in. A change throws away a recording still running. */
    scope?: string;
    /** Test seams. */
    recorder?: typeof shellAudioRecorder;
    canRecord?: boolean;
    now?: () => number;
}

export interface VoiceMessage {
    /**
     * The microphone, for the composer's send-button place (`MessageInput`'s `idleSlot`), with what
     * stands over the field while it records — the clock and the slide hint. `null` where the shell
     * cannot record.
     */
    button: ReactNode;
    /** The settings prompt for a refused microphone. Rendered once, anywhere in the page. */
    dialogs: ReactNode;
    /** A recording is starting, running or being stopped: the attach panel waits. */
    recording: boolean;
}

/**
 * The composer's hold-to-talk voice message. Pressing the microphone starts the shell's recorder;
 * releasing sends what was recorded as a message of its own, and sliding the finger left first throws
 * it away. The page never touches the microphone: the shell records into its own folder and hands
 * back the file, which goes up the way a file from the app's documents picker does.
 *
 * - **Only where the app records.** The button is drawn when the handshake lists
 *   `StartAudioRecording`, and never in a browser, so an app built before the recorder shows no
 *   control that would fail.
 * - **Pointer capture.** A finger that lifts outside the button still ends the press here; a
 *   `pointercancel` (the system taking the touch) throws the recording away.
 * - **A release before the recorder answered** — a short tap, or the first press that raised the OS
 *   permission prompt — stops it as soon as it has started. A tap is told to hold; a prompt's answer
 *   says nothing, and the next press records.
 * - **Under a second** the shell keeps nothing (`TOO_SHORT`), and the tap is told to hold.
 * - **The limit** (five minutes) and **an interruption** (a call, the app leaving the screen) are ends
 *   the shell reports by itself: the first is sent, the second is thrown away and said.
 * - **Leaving** — the conversation changing or the composer unmounting — throws a recording away, and
 *   so does typing, which puts the send button where the microphone was.
 * - **One finger.** Only the pointer that pressed moves, releases or cancels the recording.
 */
export const useVoiceMessage = ({
    sendImages,
    disabled = false,
    scope,
    recorder = shellAudioRecorder,
    canRecord: injectedCanRecord,
    now = Date.now,
}: UseVoiceMessageInput): VoiceMessage => {
    const { t } = useTranslation();
    const shellCanRecord = useCanRecordAudio();
    const canRecord = injectedCanRecord ?? shellCanRecord;
    const [phase, setPhaseState] = useState<Phase>('idle');
    const phaseRef = useRef<Phase>('idle');
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [cancelArmed, setCancelArmed] = useState(false);
    const [permissionOpen, setPermissionOpen] = useState(false);
    const pressRef = useRef<{ at: number; x: number; pointerId: number; released: 'send' | 'cancel' | null }>({
        at: 0,
        x: 0,
        pointerId: -1,
        released: null,
    });
    const slidRef = useRef(false);
    // Bumped whenever a recording is abandoned from outside — leaving, a lock — so an answer that lands
    // afterwards knows the press it belongs to is gone.
    const generationRef = useRef(0);
    const sendRef = useRef(sendImages);
    sendRef.current = sendImages;

    const setPhase = useCallback((next: Phase) => {
        phaseRef.current = next;
        setPhaseState(next);
    }, []);

    /** What an end means to the person: a message sent, or a word about why nothing was. */
    const settle = useCallback(
        (ended: OnAudioRecordingEndedPayload) => {
            switch (ended.reason) {
                case 'SENT':
                case 'MAX_DURATION':
                    void sendRef.current([toShellFile(ended.file)]);
                    return;
                case 'TOO_SHORT':
                    toast({ title: t('chat.attach.voice.holdToRecord') });
                    return;
                case 'INTERRUPTED':
                    toast({ title: t('chat.attach.voice.interrupted') });
                    return;
                case 'INTERNAL':
                    toast({ title: t('chat.attach.voice.failed'), variant: 'destructive' });
                    return;
                default:
                    // Cancelled: the slide was the feedback.
                    return;
            }
        },
        [t]
    );

    const stop = useCallback(
        async (action: 'send' | 'cancel') => {
            if (phaseRef.current !== 'recording') return;
            setPhase('stopping');
            const generation = generationRef.current;
            const ended = await recorder.stop(action);
            // A shell that had already ended it pushed that end, and `onEnded` settled it. Read again:
            // the await may have moved the phase on.
            if ((phaseRef.current as Phase) !== 'stopping') return;
            setPhase('idle');
            if (ended && generation === generationRef.current) settle(ended);
        },
        [recorder, setPhase, settle]
    );

    // The ends the shell reports by itself.
    useEffect(
        () =>
            recorder.onEnded(ended => {
                const current = phaseRef.current;
                if (current !== 'recording' && current !== 'stopping') return;
                setPhase('idle');
                settle(ended);
            }),
        [recorder, setPhase, settle]
    );

    // The clock while it records. The shell's start time, so a slow answer does not shorten it.
    useEffect(() => {
        if (phase !== 'recording') return undefined;
        const tick = () => setElapsedMs(Math.max(0, now() - startedAt));
        tick();
        const timer = setInterval(tick, 250);
        return () => clearInterval(timer);
    }, [phase, startedAt, now]);

    /** Throws away whatever is under way: leaving, or a lock. */
    const abandon = useCallback(() => {
        generationRef.current += 1;
        const current = phaseRef.current;
        if (current === 'starting') pressRef.current.released = 'cancel';
        if (current === 'recording') {
            setPhase('idle');
            void recorder.stop('cancel');
        }
    }, [recorder, setPhase]);

    useEffect(() => abandon, [scope, abandon]);
    useEffect(() => {
        if (disabled) abandon();
    }, [disabled, abandon]);

    const onPointerDown = async (event: PointerEvent<HTMLButtonElement>) => {
        if (disabled || phaseRef.current !== 'idle') return;
        // The press is this button's until it lifts, wherever the finger goes.
        event.currentTarget.setPointerCapture?.(event.pointerId);
        pressRef.current = { at: now(), x: event.clientX, pointerId: event.pointerId, released: null };
        slidRef.current = false;
        setCancelArmed(false);
        setPhase('starting');
        pauseInlineAudio();
        const generation = generationRef.current;
        const result = await recorder.start();

        if (!result.ok) {
            setPhase('idle');
            if (generation !== generationRef.current) return;
            if (result.reason === 'PERMISSION_DENIED') setPermissionOpen(true);
            else toast({ title: t('chat.attach.voice.failed'), variant: 'destructive' });
            return;
        }

        const { released } = pressRef.current;
        if (released || generation !== generationRef.current) {
            // The finger lifted before the recorder answered: nothing worth sending was said.
            const answeredAfter = now() - pressRef.current.at;
            setPhase('stopping');
            await recorder.stop('cancel');
            setPhase('idle');
            const tap = released === 'send' && generation === generationRef.current;
            if (tap && answeredAfter < PROMPT_ANSWER_MS) toast({ title: t('chat.attach.voice.holdToRecord') });
            return;
        }

        setStartedAt(result.started.startedAt);
        setElapsedMs(0);
        setPhase('recording');
        haptics.play('impact');
    };

    // Another finger on the button is not the press.
    const isPress = (event: PointerEvent<HTMLButtonElement>) => event.pointerId === pressRef.current.pointerId;

    const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
        if (phaseRef.current === 'idle' || !isPress(event)) return;
        const slid = pressRef.current.x - event.clientX > VOICE_CANCEL_SLIDE_PX;
        if (slid !== slidRef.current) {
            slidRef.current = slid;
            setCancelArmed(slid);
        }
    };

    const release = (action: 'send' | 'cancel') => {
        if (phaseRef.current === 'starting') {
            pressRef.current.released = action;
            return;
        }
        void stop(action);
    };

    const active = phase !== 'idle';

    const mic = (
        <button
            type="button"
            aria-label={t('chat.attach.voice.record')}
            disabled={disabled}
            onPointerDown={event => void onPointerDown(event)}
            onPointerMove={onPointerMove}
            onPointerUp={event => isPress(event) && release(slidRef.current ? 'cancel' : 'send')}
            onPointerCancel={event => isPress(event) && release('cancel')}
            // A long press must not open the system's own menu, select text, or scroll the page.
            onContextMenu={event => event.preventDefault()}
            className={cn(
                'flex size-8 shrink-0 touch-none select-none items-center justify-center rounded-full transition-[transform,background-color] [-webkit-touch-callout:none]',
                active ? 'scale-125 bg-destructive' : 'bg-brand-ink',
                disabled && 'cursor-not-allowed bg-control-idle'
            )}
        >
            <Mic className="size-[18px] text-white" strokeWidth={2.5} aria-hidden />
        </button>
    );

    // Laid over the field inside the composer's pill, which is positioned for it; the microphone stays
    // uncovered at the right, under the finger.
    const overlay = active ? (
        <div
            role="status"
            aria-live="polite"
            className="pointer-events-auto absolute inset-y-0 left-0 right-11 flex items-center gap-2 rounded-[100px] bg-white px-4 text-[15px] dark:bg-black"
        >
            <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" />
            <span className="tabular-nums text-foreground">{formatVideoDuration(elapsedMs)}</span>
            <span className={cn('ml-auto truncate', cancelArmed ? 'text-destructive' : 'text-description')}>
                {t(cancelArmed ? 'chat.attach.voice.releaseToCancel' : 'chat.attach.voice.slideToCancel')}
            </span>
        </div>
    ) : null;

    const dialogs = (
        <AlertDialog
            open={permissionOpen}
            onOpenChange={setPermissionOpen}
            title={t('chat.attach.permission.microphoneTitle')}
            description={t('chat.attach.permission.microphoneDescription')}
            cancelLabel={t('chat.attach.permission.cancel')}
            confirmLabel={t('chat.attach.permission.settings')}
            onConfirm={() => {
                setPermissionOpen(false);
                appBridge.openSettings();
            }}
        />
    );

    const button = canRecord ? (
        <>
            {overlay}
            {mic}
            <UnmountWatch onUnmount={() => release('cancel')} />
        </>
    ) : null;

    return { button, dialogs, recording: active };
};
