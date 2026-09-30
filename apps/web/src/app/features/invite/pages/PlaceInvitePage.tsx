import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import type { DomainPlace } from '@chatic/data';
import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';
import { useNavigateWithTransition } from '@chatic/shared';
import { FloatingButton, TextField } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useFormKeyboardFlow } from '../../../ui/hooks';
import { CountrySelect } from '../../../ui/components/CountrySelect';
import { PageHeader } from '../../../ui/components';
// Direct paths, not the barrels: `ui/layouts` reaches web-core / libs/shared, whose `import.meta` the
// CommonJS test transform cannot parse (directory-structure.md §6), and the channels hooks barrel
// pulls the whole room feature in for one hook.
import { KeyboardAwareLayout } from '../../../ui/layouts/KeyboardAwareLayout';
import { useCreateInviteBatch } from '../../channels/hooks/useCreateInviteBatch';
import { ROUTES } from '../../../routes/paths';
import {
    isValidMobileNumber,
    readInternationalInput,
    rememberCountry,
    resolveDefaultCountry,
    toE164,
    type PhoneCountry,
} from '../../../utils/phoneNumber';
import { resolvePlaceInviteGate } from '../../../utils/placeInviteGate';

const NAME_MAX = 20;
/** Raw entry is kept as typed so a bad format stays visible; digits drive logic. */
const PHONE_INPUT_MAX = 20;

/**
 * Invite someone into a cloud place without a room — the home profile menu's "invite to place".
 *
 * `user.invite` goes out with no `channelId`, so accepting joins the place and nothing else. The
 * packet carries no site either: the server files the invite under the site the session is sitting
 * on. That is why the route names the place and the page re-checks it against the session at submit
 * time — a place switch between opening the form and sending it (another tab, a push) would
 * otherwise invite the person somewhere the screen never said.
 *
 * The form mirrors the relay contact invite (`ContactInvitePage`) minus its gates: a cloud owner is a
 * main user by construction, and a cloud invite has no place-profile precondition.
 */
export const PlaceInvitePage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const fieldsRef = useRef<HTMLDivElement>(null);
    useFormKeyboardFlow(fieldsRef);

    const { placeId } = useParams<{ placeId: string }>();
    const { place: placeRepository } = runtime.data.useRuntimeRepositories();
    const { isGuest } = runtime.session.useRuntimeProfile();
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const { createPlaceInvite } = useCreateInviteBatch();

    // `undefined` until the cache has answered once, so "not loaded" and "no such place" differ.
    const [place, setPlace] = useState<DomainPlace | null | undefined>(undefined);
    useEffect(() => {
        setPlace(undefined);
        if (!placeId) {
            setPlace(null);
            return;
        }
        return placeRepository.observeItem(placeId, setPlace);
    }, [placeRepository, placeId]);

    const gate = resolvePlaceInviteGate({
        isDefaultCloud: selectedCloudId === 'default',
        isGuest,
        place,
        sessionSiteId: selectedSiteId,
    });

    // The menu entry is hidden for anyone who cannot invite here; a direct visit is sent back, the
    // same defensive backstop PlaceEditPage keeps for its owner-only screen.
    useEffect(() => {
        if (place !== undefined && gate === 'hidden') navigate(ROUTES.home, { replace: true });
    }, [place, gate, navigate]);

    const [name, setName] = useState('');
    const [phoneInput, setPhoneInput] = useState('');
    const [country, setCountry] = useState<PhoneCountry | null>(() => resolveDefaultCountry());
    const [phoneError, setPhoneError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handlePhoneChange = (value: string) => {
        const next = value.slice(0, PHONE_INPUT_MAX);
        // A pasted `+81…` declares its own country, so the picker follows it and the field is
        // rewritten to the local form — the two never point at different countries.
        const international = readInternationalInput(next);
        if (international) {
            setCountry(international.country);
            rememberCountry(international.country);
            setPhoneInput(international.national);
        } else {
            setPhoneInput(next);
        }
        if (phoneError) setPhoneError('');
    };

    const handleCountryChange = (next: PhoneCountry) => {
        setCountry(next);
        rememberCountry(next);
        if (phoneError) setPhoneError('');
    };

    const handleSubmit = async () => {
        const trimmedName = name.trim();
        if (isSubmitting || !trimmedName || !place) return;
        // Re-read at the moment of sending: the session is what the server stamps, not the route.
        if (gate !== 'ready') {
            toast({ title: t('placeInvite.placeChanged'), variant: 'destructive' });
            return;
        }
        if (!country || !isValidMobileNumber(phoneInput, country)) {
            setPhoneError(t('contactInvite.phoneInvalidFormat'));
            return;
        }

        setIsSubmitting(true);
        try {
            const { channel } = await createPlaceInvite({
                name: trimmedName,
                phone: toE164(phoneInput, country),
                placeName: place.name ?? '',
            });
            toast({
                title: t(
                    channel === 'sms'
                        ? 'inviteFriends.sentSms'
                        : channel === 'clipboard'
                          ? 'inviteFriends.sentClipboard'
                          : 'inviteFriends.sentFailed'
                ),
                ...(channel === false && { variant: 'destructive' as const }),
            });
            navigate(-1);
        } catch (error) {
            logger.error('INVITE', '[PlaceInvitePage] place invite failed', { error, data: { placeId } });
            toast({ title: t('contactInvite.issueFailed'), variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const nameError = name.length > NAME_MAX ? t('contactInvite.nameTooLong') : '';
    const isSubmitDisabled =
        gate !== 'ready' ||
        !name.trim() ||
        !phoneInput.trim() ||
        !country ||
        isSubmitting ||
        !!phoneError ||
        !!nameError;

    return (
        <KeyboardAwareLayout
            // PageHeader frosts its own notch strip, so the scaffold must not pad above it.
            headerSafeArea={false}
            header={<PageHeader title={t('placeInvite.title')} />}
            footer={
                <FloatingButton
                    label={t('contactInvite.submit')}
                    loading={isSubmitting}
                    disabled={isSubmitDisabled}
                    onClick={handleSubmit}
                />
            }
        >
            <div className="flex flex-col gap-4 px-4 pt-6">
                <h2 className="whitespace-pre-line break-keep text-center text-[20px] font-bold leading-[27px] text-foreground">
                    {t('placeInvite.heading', { placeName: place?.name ?? '' })}
                </h2>
                <p className="whitespace-pre-line text-center text-[14px] font-medium leading-[20px] text-placeholder">
                    {t('placeInvite.headingNote')}
                </p>
            </div>

            <div ref={fieldsRef} className="flex flex-col gap-6 pb-6 pt-8">
                <TextField
                    label={t('contactInvite.nameLabel')}
                    required
                    value={name}
                    onChange={setName}
                    placeholder={t('contactInvite.namePlaceholder')}
                    maxLength={NAME_MAX}
                    enforceMaxLength={false}
                    error={nameError || undefined}
                    description={t('contactInvite.nameHint')}
                />

                <TextField
                    label={t('contactInvite.phoneLabel')}
                    required
                    value={phoneInput}
                    onChange={handlePhoneChange}
                    placeholder={t('contactInvite.phonePlaceholder')}
                    type="tel"
                    inputMode="numeric"
                    error={phoneError || undefined}
                    description={t('contactInvite.phoneHint')}
                    leading={<CountrySelect value={country} onChange={handleCountryChange} />}
                />
            </div>
        </KeyboardAwareLayout>
    );
};
