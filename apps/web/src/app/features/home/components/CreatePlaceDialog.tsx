import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { cn } from '@chatic/lib/utils';
import { resizeImageToBase64 } from '@chatic/shared';

import { AlertDialog, FloatingButton, ModalTopBar, ProfileAvatar, Text, TextField, Toast } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

// Direct path, not the `ui/layouts` barrel: the barrel reaches web-core / libs/shared, whose
// `import.meta` the CommonJS test transform cannot parse (directory-structure.md §6).
import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
import { useSiteSwitch } from '../../../runtime/useSiteSwitch';
import { useCreatePlace } from '../../../hooks';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const NAME_MAX = 20;

interface Notice {
    variant: 'positive' | 'error';
    message: string;
}

interface CreatePlaceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Full-screen overlay to CREATE a new place (=Site): name + optional photo. On success it creates
 * the site on the cloud server and switches into it, then closes. Built on @chatic/web-ui-kit;
 * mirrors CreateChannelDialog. Owner/limit gating lives in the caller (HomePage).
 *
 * No mandatory profile step follows (ADR-0045 decision 4 tried this and was reverted): the
 * server-side profile row for a brand-new site is not created by `place.create`, and `profile.set`
 * (`updateSiteProfile`) is update-only — so the owner's very first profile write always 404s no
 * matter how long the client waits. The owner picks up their profile later via the existing
 * room-settings nudge (ADR-0040), same as everyone else. See place-channel-create.md.
 */
export const CreatePlaceDialog = ({ open, onOpenChange }: CreatePlaceDialogProps) => {
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { createPlace } = useCreatePlace();
    const { switchSite } = useSiteSwitch();

    const [name, setName] = useState('');
    const [thumbnail, setThumbnail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [alertOpen, setAlertOpen] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);
    // Whether the name field holds focus — i.e. the soft keyboard is up. Drives the compact layout;
    // the rationale sits on the collapsing header below.
    const [editing, setEditing] = useState(false);

    // Reset transient state each time the overlay opens.
    useEffect(() => {
        if (open) {
            setName('');
            setThumbnail('');
            setSubmitting(false);
            setAlertOpen(false);
            setNotice(null);
            setEditing(false);
        }
    }, [open]);

    const trimmed = name.trim();
    const isOverLimit = name.length > NAME_MAX;
    const canSubmit = trimmed.length >= 1 && !isOverLimit && !submitting;

    const handleImageClick = () => fileInputRef.current?.click();

    const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (file.size > MAX_IMAGE_SIZE) {
            setNotice({ variant: 'error', message: t('createPlace.imageSizeError') });
            return;
        }
        try {
            const base64 = await resizeImageToBase64(file, 150);
            setThumbnail(base64);
            setNotice(null);
        } catch {
            setNotice({ variant: 'error', message: t('createPlace.imageSizeError') });
        }
    };

    // X / esc / overlay: confirm before leaving when there is unsaved input, else exit directly.
    const requestClose = () => {
        if (submitting) return;
        if (trimmed.length > 0 || thumbnail) setAlertOpen(true);
        else onOpenChange(false);
    };

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setNotice(null);
        try {
            const created = await createPlace({ name: trimmed, thumbnail: thumbnail || undefined });
            await switchSite(created.id);
            onOpenChange(false);
        } catch (error) {
            logger.error('PLACE', 'Failed to create place', { error });
            setNotice({ variant: 'error', message: t('createPlace.saveError') });
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={next => !next && requestClose()}>
            <DialogContent
                className="flex h-full max-h-[100dvh] w-full flex-col rounded-none bg-background p-0"
                hideClose
                variant="slide-up"
                // The slide-up variant bakes in `pb-safe-bottom`, but KeyboardSafeAreaSpacer below the
                // CTA already reserves max(safe-bottom - CTA padding, keyboard-height). Keeping both
                // applies the home-indicator inset twice, and with the keyboard up it floats the CTA a
                // full inset above the keyboard instead of the intended 16px. Dropping it here leaves the
                // spacer as the single bottom inset — the same arrangement as PlaceProfileForm's page
                // container, which has no dialog padding to begin with. Inline rather than a `pb-0`
                // class: `pb-safe-bottom` is a custom spacing key tailwind-merge doesn't recognise, so
                // the two classes would both survive and the utility order would decide the winner.
                style={{ paddingBottom: 0 }}
            >
                <DialogTitle className="sr-only">{t('createPlace.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('createPlace.subtitle')}</DialogDescription>

                <div className="flex h-full w-full flex-col">
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                        {/* Glass top bar floats above the scroll area (sticky + z-index) instead of
                            occupying a band of its own, so the content passes under the translucent bar
                            while the close button stays on top and tappable (Figma 3421-59848, the
                            overlay chrome idiom from e5a0a19d). Sticky rather than KeyboardAwareLayout's
                            absolute + measured padding: dialogs can't nest that layout (slide-up already
                            applies the safe-area insets), and with safeArea={false} this bar carries no
                            variable inset to measure — its flow position is exactly the space to reserve.
                            safeArea={false}: the native WebView is already inset below the status bar,
                            so adding the safe-top inset here would double the top gap. */}
                        <ModalTopBar
                            onClose={requestClose}
                            closeLabel={t('createPlace.close')}
                            safeArea={false}
                            className="sticky top-0 z-20 shrink-0"
                        />

                        {/* Title + subtitle — folded away while the name field has focus, the
                            compact-on-focus layout CreateChannelDialog documents in full: the
                            keyboard rises over a WebView that is never resized, so the field is kept
                            readable by moving it UP rather than by scrolling to it. Animated through
                            a 0fr<->1fr grid row, the CollapsibleSection idiom. */}
                        <div
                            className={cn(
                                'grid transition-[grid-template-rows] duration-200 ease-out',
                                editing ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
                            )}
                            aria-hidden={editing}
                        >
                            <div className="min-h-0 overflow-hidden">
                                <div className="flex flex-col gap-2 px-4 py-4 text-center">
                                    <Text
                                        as="h1"
                                        className="whitespace-pre-line break-keep text-[20px] font-semibold leading-[1.35] tracking-[-0.1px] text-foreground"
                                    >
                                        {t('createPlace.title')}
                                    </Text>
                                    <Text className="whitespace-pre-line break-keep text-[14px] font-medium leading-[1.45] tracking-[-0.07px] text-description">
                                        {t('createPlace.subtitle')}
                                    </Text>
                                </div>
                            </div>
                        </div>

                        {/* Avatar + name. The paddings tighten with the same compact mode: folding
                            the header alone is not enough on a short screen, so the avatar block
                            gives up its generous spacing (and the avatar its size) while typing. */}
                        <div
                            className={cn(
                                'flex flex-col transition-all duration-200 ease-out',
                                editing ? 'gap-4 py-4' : 'gap-8 py-10'
                            )}
                        >
                            <div
                                className={cn(
                                    'flex flex-col items-center px-[18px] transition-all duration-200 ease-out',
                                    editing ? 'gap-0' : 'gap-4'
                                )}
                            >
                                {/* Keeps focus on the input when the avatar is tapped: blurring
                                    would expand the layout out from under the finger between
                                    pointerdown and click, so the tap would land on whatever moved
                                    into that spot. Preventing mousedown's default cancels the focus
                                    change while still delivering the click. */}
                                <span onMouseDown={event => event.preventDefault()}>
                                    <ProfileAvatar
                                        src={thumbnail || undefined}
                                        glyph="place"
                                        size={editing ? 56 : 86}
                                        onSelect={handleImageClick}
                                        selectLabel={t('createPlace.photoLabel')}
                                        className="transition-[width,height] duration-200 ease-out"
                                    />
                                </span>
                                <div
                                    className={cn(
                                        'grid transition-[grid-template-rows] duration-200 ease-out',
                                        editing ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
                                    )}
                                    aria-hidden={editing}
                                >
                                    <div className="min-h-0 overflow-hidden">
                                        <div className="flex flex-col items-center gap-0.5">
                                            <Text variant="label" className="text-label">
                                                {t('createPlace.photoLabel')}
                                            </Text>
                                            <Text variant="caption" className="text-placeholder">
                                                {t('createPlace.photoOptional')}
                                            </Text>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <TextField
                                label={t('createPlace.nameLabel')}
                                required
                                value={name}
                                onChange={setName}
                                maxLength={NAME_MAX}
                                enforceMaxLength={false}
                                placeholder={t('createPlace.namePlaceholder')}
                                description={t('createPlace.nameHint')}
                                error={isOverLimit ? t('createPlace.nameHint') : undefined}
                                onFocus={() => setEditing(true)}
                                onBlur={() => setEditing(false)}
                                // The docked CTA still sits behind the keyboard on a device that
                                // reports no keyboard height, so the keyboard's own done key has to
                                // be able to finish the form.
                                enterKeyHint="done"
                                onKeyDown={event => {
                                    if (event.key !== 'Enter') return;
                                    event.preventDefault();
                                    void handleSubmit();
                                }}
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

                    {notice && (
                        <div className="pointer-events-none flex shrink-0 justify-center px-4 pb-2">
                            <Toast variant={notice.variant}>{notice.message}</Toast>
                        </div>
                    )}

                    <FloatingButton
                        label={t('createPlace.done')}
                        disabled={!canSubmit}
                        onClick={handleSubmit}
                        wrapperClassName="shrink-0"
                    />
                    <KeyboardSafeAreaSpacer />
                </div>

                <AlertDialog
                    open={alertOpen}
                    onOpenChange={setAlertOpen}
                    title={t('createPlace.exitTitle')}
                    description={t('createPlace.exitDescription')}
                    cancelLabel={t('createPlace.exitLeave')}
                    onCancel={() => onOpenChange(false)}
                    confirmLabel={t('createPlace.exitContinue')}
                    onConfirm={() => undefined}
                />
            </DialogContent>
        </Dialog>
    );
};
