import { useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';

import { AlertDialog, FloatingButton, ModalTopBar, ProfileAvatar, Text, TextField, Toast } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { PageHeader } from './PageHeader';
import { KeyboardSafeAreaSpacer } from '../layouts/KeyboardSafeAreaSpacer';
import { usePickImage } from '../../hooks/usePickImage';

const NAME_MAX = 20;
const SUCCESS_CLOSE_DELAY = 1300;

interface Notice {
    variant: 'positive' | 'error';
    message: string;
}

export interface PlaceProfileExitCopy {
    title: string;
    description: string;
    leaveLabel: string;
    continueLabel: string;
}

export type PlaceProfileFormContainer = 'dialog' | 'page';

export interface ProfileSaveFailure extends Error {
    userMessage?: string;
}

export interface PlaceProfileFormProps {
    container?: PlaceProfileFormContainer;
    open: boolean;
    title: string;
    header?: string;
    subtitle?: string;
    initialNick?: string;
    initialThumbnail?: string;
    submitLabel: string;
    successToast: string;
    saveError: string;
    imageSizeError: string;
    nameLabel: string;
    nameHint: string;
    namePlaceholder?: string;
    photoLabel: string;
    photoOptional: string;
    closeLabel: string;
    dismissible?: boolean;
    exit?: PlaceProfileExitCopy;
    onSubmit: (value: { nick: string; thumbnail?: string }) => Promise<void>;
    onDone: () => void;
    onExit: () => void;
}

export const PlaceProfileForm = ({
    container = 'dialog',
    open,
    title,
    header,
    subtitle,
    initialNick = '',
    initialThumbnail = '',
    submitLabel,
    successToast,
    saveError,
    imageSizeError,
    nameLabel,
    nameHint,
    namePlaceholder,
    photoLabel,
    photoOptional,
    closeLabel,
    dismissible = true,
    exit,
    onSubmit,
    onDone,
    onExit,
}: PlaceProfileFormProps) => {
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const seededRef = useRef(false);

    const [name, setName] = useState(initialNick);
    const [thumbnail, setThumbnail] = useState(initialThumbnail);
    const [submitting, setSubmitting] = useState(false);
    const [alertOpen, setAlertOpen] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);

    useEffect(() => {
        if (open && !seededRef.current) {
            seededRef.current = true;
            setName(initialNick);
            setThumbnail(initialThumbnail);
            setSubmitting(false);
            setAlertOpen(false);
            setNotice(null);
        } else if (!open) {
            seededRef.current = false;
        }
    }, [open, initialNick, initialThumbnail]);

    useEffect(() => () => clearTimeout(closeTimer.current ?? undefined), []);

    const trimmed = name.trim();
    const isOverLimit = name.length > NAME_MAX;
    const isValidName = trimmed.length >= 1 && !isOverLimit;
    const isDirty = name !== initialNick || thumbnail !== initialThumbnail;
    const canSubmit = isValidName && isDirty && !submitting;

    const { open: handleImageClick, inputProps: imageInputProps } = usePickImage({
        onPicked: base64 => {
            setThumbnail(base64);
            setNotice(null);
        },
        onError: () => setNotice({ variant: 'error', message: imageSizeError }),
    });

    const requestClose = () => {
        if (submitting || !dismissible) return;
        if (exit && isDirty) setAlertOpen(true);
        else onExit();
    };

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setNotice(null);
        try {
            await onSubmit({ nick: trimmed, thumbnail: thumbnail || undefined });
            setNotice({ variant: 'positive', message: successToast });
            closeTimer.current = setTimeout(onDone, SUCCESS_CLOSE_DELAY);
        } catch (error) {
            logger.error('PROFILE', 'Failed to save place profile', { error });
            const overridden = (error as ProfileSaveFailure | null)?.userMessage;
            setNotice({ variant: 'error', message: overridden || saveError });
            setSubmitting(false);
        }
    };

    const body = (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {container !== 'page' && (
                <div className="flex flex-col gap-2 px-4 py-4 text-center">
                    <Text
                        as="h1"
                        className="whitespace-pre-line break-keep text-[20px] font-semibold leading-[1.35] tracking-[-0.1px] text-foreground"
                    >
                        {title}
                    </Text>
                    {subtitle && (
                        <Text className="whitespace-pre-line break-keep text-[14px] font-medium leading-[1.45] tracking-[-0.07px] text-description">
                            {subtitle}
                        </Text>
                    )}
                </div>
            )}

            <div className="flex flex-col gap-8 py-10">
                <div className="flex flex-col items-center gap-4 px-[18px]">
                    <ProfileAvatar src={thumbnail || undefined} onSelect={handleImageClick} selectLabel={photoLabel} />
                    <div className="flex flex-col items-center gap-0.5">
                        <Text variant="label" className="text-label">
                            {photoLabel}
                        </Text>
                        <Text variant="caption" className="text-placeholder">
                            {photoOptional}
                        </Text>
                    </div>
                </div>

                <TextField
                    label={nameLabel}
                    required
                    value={name}
                    onChange={setName}
                    maxLength={NAME_MAX}
                    enforceMaxLength={false}
                    placeholder={namePlaceholder}
                    description={nameHint}
                    error={isOverLimit ? nameHint : undefined}
                />
            </div>

            <input {...imageInputProps} />
        </div>
    );

    const noticeEl = notice && (
        <div className="pointer-events-none flex shrink-0 justify-center px-4 pb-2">
            <Toast variant={notice.variant}>{notice.message}</Toast>
        </div>
    );

    const footer = (
        <FloatingButton
            label={submitLabel}
            loading={submitting}
            disabled={!canSubmit}
            onClick={handleSubmit}
            wrapperClassName="shrink-0"
        />
    );

    const exitGuard = exit ? (
        <AlertDialog
            open={alertOpen}
            onOpenChange={setAlertOpen}
            title={exit.title}
            description={exit.description}
            cancelLabel={exit.leaveLabel}
            onCancel={onExit}
            confirmLabel={exit.continueLabel}
            onConfirm={() => undefined}
        />
    ) : null;

    if (container === 'page') {
        return (
            <div className="flex h-full flex-col bg-background">
                <div className="flex h-full w-full flex-col">
                    <PageHeader title={title} onBack={requestClose} />
                    {body}
                    {noticeEl}
                    {footer}
                    <KeyboardSafeAreaSpacer />
                </div>
                {exitGuard}
            </div>
        );
    }

    return (
        <Dialog open={open} onOpenChange={next => !next && dismissible && requestClose()}>
            <DialogContent
                className="flex h-full max-h-[100dvh] w-full flex-col rounded-none bg-background p-0"
                hideClose
                variant="slide-up"
                style={{ paddingTop: 0, paddingBottom: 0 }}
            >
                <DialogTitle className="sr-only">{title}</DialogTitle>
                <DialogDescription className="sr-only">{subtitle ?? title}</DialogDescription>

                <div className="flex h-full w-full flex-col">
                    <ModalTopBar
                        title={header}
                        onClose={dismissible ? requestClose : undefined}
                        closeLabel={closeLabel}
                    />
                    {body}
                    {noticeEl}
                    {footer}
                    <KeyboardSafeAreaSpacer />
                </div>

                {exitGuard}
            </DialogContent>
        </Dialog>
    );
};
