import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, Mic } from 'lucide-react';

import type { OnAudioRecordingEndedPayload } from '@chatic/bridge-messages';
import type { ChatAttachmentSource } from '@chatic/runtime-react';
import { cn } from '@chatic/ui-kit';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import { AlertDialog, BottomSheet, formatVideoDuration } from '@chatic/web-ui-kit';

import { appBridge } from '../../../bridge/appBridge';
import { toShellFile } from '../../../bridge/attachmentPicker';
import {
    audioRecorder as shellAudioRecorder,
    useCanRecordAudio,
    VOICE_MESSAGE_MAX_MS,
} from '../../../bridge/audioRecorder';
import { haptics } from '../../../bridge/haptics';

import { pauseInlineAudio } from './useInlineAudio';

type Phase = 'idle' | 'starting' | 'recording' | 'stopping';

interface UseVoiceMessageInput {
    sendImages: (files: ChatAttachmentSource[]) => Promise<void>;
    disabled?: boolean;
    scope?: string;
    recorder?: typeof shellAudioRecorder;
    canRecord?: boolean;
    now?: () => number;
}

export interface VoiceMessage {
    canRecord: boolean;
    open: () => void;
    sheet: ReactNode;
}

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
    const canRecord = (injectedCanRecord ?? shellCanRecord) && !disabled;
    const [isOpen, setIsOpen] = useState(false);
    const [phase, setPhaseState] = useState<Phase>('idle');
    const phaseRef = useRef<Phase>('idle');
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [permissionOpen, setPermissionOpen] = useState(false);
    const generationRef = useRef(0);
    const sendRef = useRef(sendImages);
    sendRef.current = sendImages;

    const setPhase = useCallback((next: Phase) => {
        phaseRef.current = next;
        setPhaseState(next);
    }, []);

    const settle = useCallback(
        (ended: OnAudioRecordingEndedPayload) => {
            switch (ended.reason) {
                case 'SENT':
                case 'MAX_DURATION':
                    setIsOpen(false);
                    void sendRef.current([toShellFile(ended.file)]);
                    return;
                case 'TOO_SHORT':
                    toast({ title: t('chat.attach.voice.tooShort') });
                    return;
                case 'INTERRUPTED':
                    toast({ title: t('chat.attach.voice.interrupted') });
                    return;
                case 'INTERNAL':
                    toast({ title: t('chat.attach.voice.failed'), variant: 'destructive' });
                    return;
                default:
                    return;
            }
        },
        [t]
    );

    const send = useCallback(async () => {
        if (phaseRef.current !== 'recording') return;
        setPhase('stopping');
        const generation = generationRef.current;
        const ended = await recorder.stop('send');
        if ((phaseRef.current as Phase) !== 'stopping') return;
        setPhase('idle');
        if (ended && generation === generationRef.current) settle(ended);
    }, [recorder, setPhase, settle]);

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

    useEffect(() => {
        if (phase !== 'recording') return undefined;
        const tick = () => setElapsedMs(Math.max(0, now() - startedAt));
        tick();
        const timer = setInterval(tick, 250);
        return () => clearInterval(timer);
    }, [phase, startedAt, now]);

    const discard = useCallback(() => {
        generationRef.current += 1;
        if (phaseRef.current === 'recording') {
            setPhase('idle');
            void recorder.stop('cancel');
        }
    }, [recorder, setPhase]);

    const abandon = useCallback(() => {
        discard();
        setIsOpen(false);
    }, [discard]);

    useEffect(() => abandon, [scope, abandon]);
    useEffect(() => {
        if (disabled) abandon();
    }, [disabled, abandon]);

    const start = async () => {
        if (phaseRef.current !== 'idle') return;
        setPhase('starting');
        pauseInlineAudio();
        const generation = generationRef.current;
        const result = await recorder.start();

        if (!result.ok) {
            setPhase('idle');
            if (generation !== generationRef.current) return;
            if (result.reason === 'PERMISSION_DENIED') {
                setIsOpen(false);
                setPermissionOpen(true);
            } else {
                toast({ title: t('chat.attach.voice.failed'), variant: 'destructive' });
            }
            return;
        }
        if (generation !== generationRef.current) {
            setPhase('stopping');
            await recorder.stop('cancel');
            setPhase('idle');
            return;
        }
        setStartedAt(result.started.startedAt);
        setElapsedMs(0);
        setPhase('recording');
        haptics.play('impact');
    };

    const open = useCallback(() => {
        if (canRecord) setIsOpen(true);
    }, [canRecord]);

    const close = () => {
        if (phaseRef.current === 'stopping') return;
        discard();
        setIsOpen(false);
    };

    const active = phase !== 'idle';

    const sheet = (
        <>
            <BottomSheet
                open={isOpen}
                onOpenChange={next => {
                    if (!next && !active) close();
                }}
                onClose={close}
                title={t('chat.attach.voice.title')}
                description={t('chat.attach.voice.description')}
                closeLabel={t('common.close')}
                disableDragToDismiss={active}
            >
                <div className="flex flex-col items-center gap-4 px-6 pb-6 pt-2">
                    <div role="timer" className="flex items-baseline gap-1.5 tabular-nums">
                        <span
                            aria-hidden
                            className={cn(
                                'mb-1 size-2.5 self-center rounded-full',
                                phase === 'recording' ? 'animate-pulse bg-destructive' : 'bg-control-idle'
                            )}
                        />
                        <span className="text-[32px] font-semibold text-foreground">
                            {formatVideoDuration(phase === 'recording' || phase === 'stopping' ? elapsedMs : 0)}
                        </span>
                        <span className="text-[15px] text-description">
                            / {formatVideoDuration(VOICE_MESSAGE_MAX_MS)}
                        </span>
                    </div>
                    <p className="text-center text-[14px] text-description">
                        {t(active ? 'chat.attach.voice.recordingHint' : 'chat.attach.voice.tapToRecord')}
                    </p>
                    {phase === 'recording' || phase === 'stopping' ? (
                        <div className="flex w-full gap-3 pt-2">
                            <button
                                type="button"
                                onClick={close}
                                disabled={phase === 'stopping'}
                                className="h-12 flex-1 rounded-full bg-secondary text-[16px] font-semibold text-foreground disabled:opacity-40"
                            >
                                {t('chat.attach.voice.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={() => void send()}
                                disabled={phase === 'stopping'}
                                className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-brand-ink text-[16px] font-semibold text-white disabled:opacity-40"
                            >
                                <ArrowUp className="size-[18px]" strokeWidth={2.5} aria-hidden />
                                {t('chat.attach.voice.send')}
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => void start()}
                            disabled={phase === 'starting'}
                            aria-label={t('chat.attach.voice.record')}
                            className="mt-2 flex size-[72px] items-center justify-center rounded-full bg-destructive text-white transition-opacity active:opacity-80 disabled:opacity-40"
                        >
                            <Mic className="size-8" strokeWidth={2.25} aria-hidden />
                        </button>
                    )}
                </div>
            </BottomSheet>
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
        </>
    );

    return { canRecord, open, sheet };
};
