import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { cn } from '@chatic/lib/utils';
import { AVATAR_IMAGE, prepareImage } from '@chatic/shared';

import { AlertDialog, FloatingButton, ModalTopBar, ProfileAvatar, Text, TextField, Toast } from '@chatic/web-ui-kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

// Direct path, not the `ui/layouts` barrel: the barrel reaches web-core / libs/shared, whose
// `import.meta` the CommonJS test transform cannot parse (directory-structure.md §6).
import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';
import { useSiteSwitch } from '../../../runtime/useSiteSwitch';
import { useCreatePlace, useSetMyPlaceProfile } from '../../../hooks';
import { PlaceProfileCreateDialog } from '../../../ui/components/PlaceProfileCreateDialog';

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
 * Full-screen overlay to CREATE a new place (=Site): name + optional photo, then the creator's
 * profile in it. Creates the site on the cloud server, switches into it, asks for the profile, then
 * closes. Built on @chatic/web-ui-kit; mirrors CreateChannelDialog. Owner/limit gating lives in the
 * caller (HomePage).
 *
 * **The profile step comes after the switch, never before or alongside it.** The server stores a
 * profile on the site the session is on and ignores the site a request names, so it can only be
 * written from inside the new place. `place.create` makes no profile row for the creator and
 * `profile.set` only updates, so the first save there answers 404 — the profile repository recovers
 * by creating the row with `profile.get-mine` and saving again. The step is required, but its way
 * out appears once a save has failed: holding the creator on a form the server will not take is
 * worse than a place without a profile, which the missing-profile prompts pick up later.
 *
 * Creating and switching are two server calls. When the create went through and the switch did not,
 * the retry repeats only the switch, so a second tap never makes a second place.
 */
/**
 * The screen shows the same "too large" message for a codec failure as for an oversized file, so
 * the two are indistinguishable to the user and were indistinguishable to us. Size and type are
 * what separate them; the file's contents are never recorded (ADR-0099).
 */
const logImageEncodeFailure = (error: unknown, file: File): void =>
    logger.warn('PLACE', 'place image encoding failed', {
        error,
        data: { sizeBytes: file.size, type: file.type },
    });

export const CreatePlaceDialog = ({ open, onOpenChange }: CreatePlaceDialogProps) => {
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { createPlace } = useCreatePlace();
    const { switchSite } = useSiteSwitch();
    const setMyPlaceProfile = useSetMyPlaceProfile();

    const [name, setName] = useState('');
    const [thumbnail, setThumbnail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [alertOpen, setAlertOpen] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);
    // Whether the name field holds focus — i.e. the soft keyboard is up. Drives the compact layout;
    // the rationale sits on the collapsing header below.
    const [editing, setEditing] = useState(false);
    // A place this dialog created but has not switched into yet — the retry target after a failed
    // switch, so the create is not repeated. Its name is kept with it: the field may be edited before
    // the retry, and the profile step must name the place that exists, not the text in the field.
    const [unswitchedPlace, setUnswitchedPlace] = useState<{ id: string; name: string } | null>(null);
    // Set once the new place is created AND entered: the dialog then shows the profile step for it.
    const [profilePlaceName, setProfilePlaceName] = useState<string | null>(null);
    const [profileSaveFailed, setProfileSaveFailed] = useState(false);

    // Reset transient state each time the overlay opens.
    useEffect(() => {
        if (open) {
            setName('');
            setThumbnail('');
            setSubmitting(false);
            setAlertOpen(false);
            setNotice(null);
            setEditing(false);
            setUnswitchedPlace(null);
            setProfilePlaceName(null);
            setProfileSaveFailed(false);
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
            const { avatar: base64 } = await prepareImage(file, AVATAR_IMAGE);
            // A record field has nothing to fall back to, so a preview that could not be made is
            // an error here, not a degraded result.
            if (!base64) throw new Error('Failed to prepare avatar image');
            setThumbnail(base64);
            setNotice(null);
        } catch (error) {
            logImageEncodeFailure(error, file);
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
            let place = unswitchedPlace;
            if (!place) {
                const created = await createPlace({ name: trimmed, thumbnail: thumbnail || undefined });
                place = { id: created.id, name: created.name || trimmed };
                setUnswitchedPlace(place);
            }
            await switchSite(place.id);
            setUnswitchedPlace(null);
            setSubmitting(false);
            setProfilePlaceName(place.name);
        } catch (error) {
            logger.error('PLACE', 'Failed to create place', { error });
            setNotice({ variant: 'error', message: t('createPlace.saveError') });
            setSubmitting(false);
        }
    };

    const submitProfile = async (value: { nick: string; thumbnail?: string }) => {
        try {
            await setMyPlaceProfile(value);
        } catch (error) {
            setProfileSaveFailed(true);
            throw error;
        }
    };

    // The place exists and the session is inside it: ask for the creator's profile there. Saved or
    // skipped (after a failed save), leaving this step closes the whole flow.
    if (open && profilePlaceName !== null) {
        return (
            <PlaceProfileCreateDialog
                open
                placeName={profilePlaceName}
                dismissible={profileSaveFailed}
                onSubmit={submitProfile}
                onDone={() => onOpenChange(false)}
                onExit={() => onOpenChange(false)}
            />
        );
    }

    return (
        <Dialog open={open} onOpenChange={next => !next && requestClose()}>
            <DialogContent
                className="flex h-full max-h-[100dvh] w-full flex-col rounded-none bg-background p-0"
                hideClose
                variant="slide-up"
                // Top: the slide-up variant's own `pt-safe-top` renders the status-bar band as
                // opaque `bg-background` ABOVE the glass bar, so only the 44px bar looked
                // frosted. The bar carries the inset itself (ModalTopBar's default `safeArea`),
                // which puts the whole band inside the translucent, blurred header.
                //
                // The slide-up variant bakes in `pb-safe-bottom`, but KeyboardSafeAreaSpacer below the
                // CTA already reserves max(safe-bottom - CTA padding, keyboard-height). Keeping both
                // applies the home-indicator inset twice, and with the keyboard up it floats the CTA a
                // full inset above the keyboard instead of the intended 16px. Dropping it here leaves the
                // spacer as the single bottom inset — the same arrangement as PlaceProfileForm's page
                // container, which has no dialog padding to begin with. Inline rather than a `pb-0`
                // class: `pb-safe-bottom` is a custom spacing key tailwind-merge doesn't recognise, so
                // the two classes would both survive and the utility order would decide the winner.
                style={{ paddingTop: 0, paddingBottom: 0 }}
            >
                <DialogTitle className="sr-only">{t('createPlace.title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('createPlace.subtitle')}</DialogDescription>

                <div className="flex h-full w-full flex-col">
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                        {/* Glass top bar floats above the scroll area (sticky + z-index) instead of
                            occupying a band of its own, so the content passes under the translucent bar
                            while the close button stays on top and tappable (Figma 3421-59848, the
                            overlay chrome idiom from e5a0a19d). Sticky rather than KeyboardAwareLayout's
                            absolute + measured padding: dialogs can't nest that layout, and a sticky bar
                            in flow reserves exactly its own height at the top of the scroller.
                            safeArea: the bar owns the status-bar inset (the dialog's `pt-safe-top` is
                            zeroed above) so the blur covers the notch band too, not just the 44px bar. */}
                        <ModalTopBar
                            onClose={requestClose}
                            closeLabel={t('createPlace.close')}
                            className="sticky top-0 z-20 shrink-0"
                        />

                        {/* Title + subtitle — folded away while the name field has focus, the
                            compact-on-focus layout CreateChannelDialog documents in full: the
                            keyboard rises over a WebView that is never resized, so the field is kept
                            readable by moving it UP rather than by scrolling to it. Animated through
                            a 0fr<->1fr grid row, the CollapsibleSection idiom, and faded alongside so
                            the text dissolves rather than being cut off by the shrinking row. */}
                        <div
                            className={cn(
                                'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
                                editing ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
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
                            gives up its generous spacing and its caption while typing. The avatar
                            keeps its size — the folded text frees enough height, and a photo that
                            shrank on every focus read as the screen changing under the user. */}
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
                                        onSelect={handleImageClick}
                                        selectLabel={t('createPlace.photoLabel')}
                                    />
                                </span>
                                <div
                                    className={cn(
                                        'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
                                        editing ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
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
