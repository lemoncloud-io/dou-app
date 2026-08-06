import { useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';
import { resizeImageToBase64 } from '@chatic/shared';

import { AlertDialog, FloatingButton, ModalTopBar, ProfileAvatar, Text, TextField, Toast } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

// Direct file paths, not the `.` / `../layouts` barrels: those re-export components reaching
// libs/shared and web-core, whose `import.meta` the CommonJS test transform cannot parse
// (directory-structure.md §6). Keep the direct paths.
import { PageHeader } from './PageHeader';
import { KeyboardSafeAreaSpacer } from '../layouts/KeyboardSafeAreaSpacer';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const NAME_MAX = 20;
const SUCCESS_CLOSE_DELAY = 1300; // keep the success toast visible briefly before closing

interface Notice {
    variant: 'positive' | 'error';
    message: string;
}

/** Confirm-on-exit copy for the unsaved-changes guard. */
export interface PlaceProfileExitCopy {
    title: string;
    description: string;
    /** Destructive action — leaves without saving. */
    leaveLabel: string;
    /** Cancel action — dismisses the guard and keeps editing. */
    continueLabel: string;
}

/** Where the shared form renders: a slide-up dialog (home dropdown) or a full route page (settings hub). */
export type PlaceProfileFormContainer = 'dialog' | 'page';

/**
 * An `onSubmit` rejection that names its own user-facing message. Used where the submit commits
 * more than the profile (the place-create flow saves the PLACE first), so "프로필 저장 실패" would be
 * the wrong thing to tell the user.
 */
export interface ProfileSaveFailure extends Error {
    userMessage?: string;
}

export interface PlaceProfileFormProps {
    /** Chrome to wrap the shared body in. Defaults to 'dialog'. */
    container?: PlaceProfileFormContainer;
    /** Controls visibility. Dialog: owned by the caller. Page: always mounted (pass true). */
    open: boolean;
    /**
     * Screen title; supports `\n` (rendered with `whitespace-pre-line`). The dialog container renders
     * it as an in-body heading; the page container renders it in the top-bar PageHeader instead (a
     * short label like "내 프로필"), so the in-body heading is dialog-only.
     */
    title: string;
    /** Optional subtitle under the title. Omitted in the edit flow. */
    subtitle?: string;
    /** Initial nick — empty for create, current profile nick for edit. */
    initialNick?: string;
    /** Initial thumbnail (data/URL) — empty for create, current for edit. */
    initialThumbnail?: string;
    /** CTA label (e.g. "완료"). */
    submitLabel: string;
    /** Toast shown on successful save, right before the container closes. */
    successToast: string;
    /** Toast shown when the save fails. */
    saveError: string;
    /** Toast shown when the picked image is too large / unreadable. */
    imageSizeError: string;
    nameLabel: string;
    nameHint: string;
    namePlaceholder?: string;
    photoLabel: string;
    photoOptional: string;
    /** Accessible label for the close (X) button — dialog container only. */
    closeLabel: string;
    /**
     * Whether the user may dismiss without saving. Defaults to true. When false the close (X),
     * esc, and overlay-dismiss are all disabled — used for the mandatory first-time profile setup
     * (relay/default place). Only meaningful for the dialog container.
     */
    dismissible?: boolean;
    /**
     * Copy for the unsaved-changes exit guard. When omitted, X / esc / overlay / back exit
     * immediately without a guard — the invite paths (ADR-0041) do that, since backing out there
     * means the invite was never sent or accepted. Supply it to keep the guard (the edit flows do).
     */
    exit?: PlaceProfileExitCopy;
    /**
     * Persists the profile; rejecting surfaces `saveError`. A caller whose submit does more than
     * save the profile can override the message per failure by rejecting with an error carrying
     * `userMessage` — see {@link ProfileSaveFailure}.
     */
    onSubmit: (value: { nick: string; thumbnail?: string }) => Promise<void>;
    /** Called after a successful save (once the success toast has shown). */
    onDone: () => void;
    /** Called when the user leaves without saving. */
    onExit: () => void;
}

/**
 * Shared editor for the per-place profile (nick + optional photo). The create and edit flows are the
 * same screen — same layout, same `setMyProfile` save path — differing only in copy, initial values,
 * and success handling. The `container` prop swaps the chrome (slide-up dialog for the home dropdown,
 * full route page for the settings hub) while all form state, validation, image handling, and the
 * unsaved-changes guard live here exactly once. Built on @chatic/web-ui-kit.
 */
export const PlaceProfileForm = ({
    container = 'dialog',
    open,
    title,
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
    const fileInputRef = useRef<HTMLInputElement>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const seededRef = useRef(false);

    const [name, setName] = useState(initialNick);
    const [thumbnail, setThumbnail] = useState(initialThumbnail);
    const [submitting, setSubmitting] = useState(false);
    const [alertOpen, setAlertOpen] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);

    // Seed transient state from the initial values only on the open transition (false→true) — once per
    // open. The edit flow's initial values come from an observed profile cache that can emit again while
    // the screen is open (background sync, a late first load); re-seeding on every change would clobber
    // the user's in-progress edits, so we latch and don't re-seed until it closes and reopens. The page
    // container passes open=true from mount, so this latches once on mount.
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

    // Clear a pending close timer on unmount.
    useEffect(() => () => clearTimeout(closeTimer.current ?? undefined), []);

    const trimmed = name.trim();
    const isOverLimit = name.length > NAME_MAX;
    const isValidName = trimmed.length >= 1 && !isOverLimit;
    // Dirty vs the initial values: create (empty initials) → dirty when anything is entered;
    // edit → dirty only when the nick or photo actually changed.
    const isDirty = name !== initialNick || thumbnail !== initialThumbnail;
    const canSubmit = isValidName && isDirty && !submitting;

    const handleImageClick = () => fileInputRef.current?.click();

    const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (file.size > MAX_IMAGE_SIZE) {
            setNotice({ variant: 'error', message: imageSizeError });
            return;
        }
        try {
            const base64 = await resizeImageToBase64(file, 150);
            setThumbnail(base64);
            setNotice(null);
        } catch {
            setNotice({ variant: 'error', message: imageSizeError });
        }
    };

    // X / esc / overlay / page back: confirm before leaving when there are unsaved changes, else exit
    // directly. No-op when mandatory (dismissible === false) so there's no way to skip setup.
    // With no `exit` copy the guard is off entirely — leaving is immediate even when dirty.
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
            // Show the success toast over the still-open screen, then close (matches Figma).
            setNotice({ variant: 'positive', message: successToast });
            closeTimer.current = setTimeout(onDone, SUCCESS_CLOSE_DELAY);
        } catch (error) {
            logger.error('PROFILE', 'Failed to save place profile', { error });
            // Carried on the rejection rather than read from a prop: the caller learns which step
            // failed only inside its own onSubmit, and a state update it makes there has not
            // re-rendered this form by the time the throw lands here.
            const overridden = (error as ProfileSaveFailure | null)?.userMessage;
            setNotice({ variant: 'error', message: overridden || saveError });
            setSubmitting(false);
        }
    };

    // Scrollable body — shared verbatim by both containers.
    const body = (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {/* Title + optional subtitle. The page container shows the title in its PageHeader instead
                (the settings-hub edit screen), so the in-body title is dialog-only. */}
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

            {/* Avatar + name — the Figma py-40 / gap-32 block */}
            <div className="flex flex-col gap-8 py-10">
                {/* Profile photo (optional) */}
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

                {/* Name (required, 1–20; soft cap so the over-limit error is reachable) */}
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

            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                className="hidden"
            />
        </div>
    );

    // Inline notice (success / error) — rendered above the CTA like the Figma snackbar.
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

    // Null without `exit` copy: requestClose never opens it in that mode, so there is nothing to render.
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

    // Page container: a full-screen route with a back-button header (no overlay / esc dismissal).
    if (container === 'page') {
        return (
            <div className="flex h-full flex-col bg-background pt-safe-top">
                <div className="mx-auto flex h-full w-full max-w-[440px] flex-col">
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

    // Dialog container: slide-up overlay opened from the home dropdown / create prompt.
    return (
        <Dialog open={open} onOpenChange={next => !next && dismissible && requestClose()}>
            <DialogContent
                className="m-0 flex h-full max-h-[100dvh] w-full max-w-full flex-col items-center rounded-none bg-background p-0"
                hideClose
                variant="slide-up"
                // The slide-up variant bakes in `pb-safe-bottom`, but KeyboardSafeAreaSpacer below the
                // CTA already reserves max(safe-bottom - CTA padding, keyboard-height). Keeping both
                // applies the home-indicator inset twice, and with the keyboard up it floats the CTA a
                // full inset above the keyboard. Dropping it leaves the spacer as the single bottom
                // inset, matching this same form's `container="page"` branch. Inline rather than a
                // `pb-0` class: `pb-safe-bottom` is a custom spacing key tailwind-merge doesn't
                // classify as padding-bottom, so both would survive and utility order would decide.
                style={{ paddingBottom: 0 }}
            >
                <DialogTitle className="sr-only">{title}</DialogTitle>
                <DialogDescription className="sr-only">{subtitle ?? title}</DialogDescription>

                {/* Responsive: full-bleed on phones, capped to a phone-width column centered on wider
                    screens so the layout (and the full-width CTA) never stretches. */}
                <div className="flex h-full w-full max-w-[440px] flex-col">
                    {/* Omit onClose when mandatory so ModalTopBar hides the close (X) button.
                        safeArea={false}: the native WebView is already inset below the status bar,
                        so adding the safe-top inset here would double the top gap. */}
                    <ModalTopBar
                        onClose={dismissible ? requestClose : undefined}
                        closeLabel={closeLabel}
                        safeArea={false}
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
