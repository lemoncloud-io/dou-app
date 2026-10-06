import { Loader2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useFormKeyboardFlow } from '../../../ui/hooks';
import { Sheet, SheetContent } from '@chatic/ui-kit/components/ui/sheet';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { CountrySelect } from '../../../ui/components/CountrySelect';
// Direct path for `phoneNumber`: it is deliberately kept out of the `utils` barrel (libphonenumber's
// metadata — see that barrel's comment).
import {
    isValidMobileNumber,
    readInternationalInput,
    rememberCountry,
    resolveDefaultCountry,
    toE164,
    type PhoneCountry,
} from '../../../utils/phoneNumber';

interface AddFriendSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /**
     * Issues an invite for this name and number (E.164, `+821012345678`) and answers its link,
     * without sharing it. The host decides what the invite is for — a room, or a place — so the
     * sheet never names either. Absent while the host has nothing to invite into yet; the button
     * stays disabled.
     */
    requestLink?: (recipient: { name: string; phone: string }) => Promise<string>;
    /** Receives the link once the sheet has closed, to hand it to the host's link screen. */
    onLinkReady: (inviteLink: string) => void;
    /** The two-line heading; defaults to the room invite's ("the friend to invite to the chat room"). */
    heading?: [string, string];
}

interface InputFieldProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    maxLength: number;
    type?: 'text' | 'tel';
}

const InputField = ({ label, value, onChange, placeholder, maxLength, type = 'text' }: InputFieldProps) => (
    <div className="flex flex-col gap-2">
        <label className="text-[14px] font-semibold leading-[1.286] tracking-[0.005em] text-muted-foreground">
            {label}
        </label>
        <div className="flex items-center rounded-[10px] border border-border bg-background px-3 py-3">
            <input
                value={value}
                onChange={e => onChange(e.target.value.slice(0, maxLength))}
                placeholder={placeholder}
                type={type}
                className="flex-1 text-[16px] font-normal leading-[1.45] tracking-[-0.015em] text-foreground placeholder:text-muted-foreground outline-none bg-transparent"
            />
            <span className="text-[13px] font-medium tracking-[0.019em] text-muted-foreground opacity-74 shrink-0">
                {value.length}/{maxLength}
            </span>
        </div>
    </div>
);

const NAME_MAX = 20;
/**
 * Raw entry is kept as typed, so a cap on characters rather than digits: the right digit count
 * depends on the country, and validation is what rejects a wrong one.
 */
const PHONE_INPUT_MAX = 20;
/**
 * Bidi and other invisible format marks (`U+202D` … `U+202C`). A number copied out of another app
 * can carry them, and the strict parser rejects a number that has them — the Korean-only check this
 * replaced dropped every non-digit, so the same paste used to pass.
 */
const FORMAT_MARKS = /\p{Cf}/gu;

export const AddFriendSheet = ({ open, onOpenChange, requestLink, onLinkReady, heading }: AddFriendSheetProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [name, setName] = useState('');
    const [phoneInput, setPhoneInput] = useState('');
    // The last explicit pick, else the device locale's region — the same opening rule as the relay
    // invite's field. Korea when neither answers: this sheet took Korean numbers alone until now, and
    // a region-less locale (`ko`) must not turn the default case into "pick a country first".
    const [country, setCountry] = useState<PhoneCountry>(() => resolveDefaultCountry() ?? 'KR');
    const [phoneError, setPhoneError] = useState('');
    const fieldsRef = useRef<HTMLDivElement>(null);
    useFormKeyboardFlow(fieldsRef);
    const [isPending, setIsPending] = useState(false);

    const handlePhoneChange = (value: string) => {
        const next = value.replace(FORMAT_MARKS, '').slice(0, PHONE_INPUT_MAX);
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
        // Clear error when user starts typing again
        if (phoneError) setPhoneError('');
    };

    const handleCountryChange = (next: PhoneCountry) => {
        setCountry(next);
        rememberCountry(next);
        if (phoneError) setPhoneError('');
    };

    /**
     * The number as the invite carries it, or `null` after showing the error. Mobile only: the
     * invite reaches the recipient as a text.
     */
    const validatePhone = (): string | null => {
        if (!isValidMobileNumber(phoneInput, country)) {
            setPhoneError(t('addFriend.phoneInvalidFormat'));
            return null;
        }
        return toE164(phoneInput, country);
    };

    const resetAndClose = () => {
        setName('');
        setPhoneInput('');
        setPhoneError('');
        onOpenChange(false);
    };

    const handleShare = async () => {
        if (!requestLink || isPending || !name.trim() || !phoneInput.trim()) return;
        const phone = validatePhone();
        if (!phone) return;

        setIsPending(true);
        try {
            // Obtain the invite link (no auto-share) and hand it to the host's link page.
            const inviteLink = await requestLink({ name: name.trim(), phone });

            resetAndClose();
            onLinkReady(inviteLink);
        } catch (error) {
            logger.error('INVITE', 'Failed to create invite', { error });
            const message =
                error instanceof Error
                    ? error.message
                    : typeof error === 'object' && error !== null && 'message' in error
                      ? String(error.message)
                      : t('inviteFriends.batchFailed');
            toast({ title: message, variant: 'destructive' });
        } finally {
            setIsPending(false);
        }
    };

    const isDisabled = !name.trim() || !phoneInput.trim() || !requestLink || isPending || !!phoneError;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="rounded-t-[20px] p-0 border-0 bg-background max-h-[85dvh] flex flex-col"
                hideClose
                style={{ transform: 'translateY(calc(-1 * var(--keyboard-height, 0px)))' }}
            >
                <div className="shrink-0 flex items-center justify-between px-4 py-[14px]">
                    <span className="text-[16px] font-medium leading-[1.5] tracking-[-0.02em] text-foreground">
                        {t('addFriend.title')}
                    </span>
                    <button
                        onClick={resetAndClose}
                        className="w-6 h-6 flex items-center justify-center rounded-full bg-muted"
                    >
                        <X className="w-[14px] h-[14px] text-foreground" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-none">
                    <div ref={fieldsRef} className="flex flex-col gap-[26px] px-4">
                        <div className="flex flex-col gap-[2px]">
                            <span className="text-[20px] font-semibold leading-[1.35] tracking-[-0.025em] text-foreground">
                                {heading?.[0] ?? t('addFriend.subtitle1')}
                            </span>
                            <span className="text-[20px] font-semibold leading-[1.35] tracking-[-0.025em] text-foreground">
                                {heading?.[1] ?? t('addFriend.subtitle2')}
                            </span>
                        </div>

                        <InputField
                            label={t('addFriend.nameLabel')}
                            value={name}
                            onChange={setName}
                            placeholder={t('addFriend.namePlaceholder')}
                            maxLength={NAME_MAX}
                        />

                        <div className="flex flex-col gap-2">
                            <label className="text-[14px] font-semibold leading-[1.286] tracking-[0.005em] text-muted-foreground">
                                {t('addFriend.phoneLabel')}
                            </label>
                            <div
                                className={`flex items-center gap-3 rounded-[10px] border bg-background px-3 py-3 ${phoneError ? 'border-destructive' : 'border-border'}`}
                            >
                                <CountrySelect value={country} onChange={handleCountryChange} />
                                <input
                                    value={phoneInput}
                                    onChange={e => handlePhoneChange(e.target.value)}
                                    placeholder={t('addFriend.phonePlaceholder')}
                                    type="tel"
                                    className="min-w-0 flex-1 text-[16px] font-normal leading-[1.45] tracking-[-0.015em] text-foreground placeholder:text-muted-foreground outline-none bg-transparent"
                                />
                            </div>
                            {phoneError && <span className="text-[12px] text-destructive">{phoneError}</span>}
                        </div>
                    </div>
                </div>

                <div className="shrink-0">
                    <div className="px-4 pt-5 pb-4">
                        <button
                            onClick={handleShare}
                            disabled={isDisabled}
                            className="w-full rounded-full py-3 text-[16px] font-semibold leading-[1.375] tracking-[0.005em] text-center transition-colors
                                disabled:bg-muted disabled:text-muted-foreground
                                enabled:bg-[#B0EA10] enabled:text-[#222325]"
                        >
                            {isPending ? <Loader2 className="mx-auto size-5 animate-spin" /> : t('addFriend.share')}
                        </button>
                    </div>
                    <div
                        className="shrink-0 touch-none bg-background"
                        style={{ height: 'var(--safe-bottom, 0px)' }}
                        onTouchMove={e => e.preventDefault()}
                    />
                </div>
            </SheetContent>
        </Sheet>
    );
};
