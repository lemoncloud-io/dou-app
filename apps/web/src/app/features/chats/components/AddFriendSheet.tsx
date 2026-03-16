import { X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getMobileAppInfo, postMessage } from '@chatic/app-messages';
import { Sheet, SheetContent } from '@chatic/ui-kit/components/ui/sheet';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useCreateInvite } from '../hooks/useCreateInvite';

interface AddFriendSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channelId?: string;
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
const PHONE_DIGITS_MAX = 11;

const formatPhoneNumber = (digits: string): string => {
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

export const AddFriendSheet = ({ open, onOpenChange, channelId }: AddFriendSheetProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [name, setName] = useState('');
    const [phoneDigits, setPhoneDigits] = useState('');
    const { createInvite, isPending } = useCreateInvite();

    const handlePhoneChange = (value: string) => {
        const digits = value.replace(/\D/g, '').slice(0, PHONE_DIGITS_MAX);
        setPhoneDigits(digits);
    };

    const resetAndClose = () => {
        setName('');
        setPhoneDigits('');
        onOpenChange(false);
    };

    const copyToClipboard = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            toast({ title: t('inviteFriends.linkCopied') });
        } catch {
            toast({ title: t('inviteFriends.shareFailed'), variant: 'destructive' });
        }
    };

    const handleShare = async () => {
        if (!channelId || !name.trim() || !phoneDigits) return;

        try {
            const { deeplinkUrl } = await createInvite({
                channelId,
                name: name.trim(),
                phone: phoneDigits,
            });

            const { isOnMobileApp } = getMobileAppInfo();

            // Copy to clipboard first
            await copyToClipboard(deeplinkUrl);

            // Mobile app: also open native share sheet
            if (isOnMobileApp) {
                postMessage({
                    type: 'OpenShareSheet',
                    data: {
                        title: t('inviteFriends.shareTitle'),
                        message: t('inviteFriends.shareMessage'),
                    },
                });
            }

            resetAndClose();
        } catch (error) {
            console.error('Failed to create invite:', error);
            const message =
                error instanceof Error
                    ? error.message
                    : typeof error === 'object' && error !== null && 'message' in error
                      ? String(error.message)
                      : t('inviteFriends.shareFailed');
            toast({ title: message, variant: 'destructive' });
        }
    };

    const isDisabled = !name.trim() || !phoneDigits || !channelId || isPending;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="rounded-t-[20px] p-0 border-0 bg-background" hideClose>
                <div className="flex items-center justify-between px-4 py-[14px]">
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

                <div className="flex flex-col gap-[26px] px-4">
                    <div className="flex flex-col gap-[2px]">
                        <span className="text-[20px] font-semibold leading-[1.35] tracking-[-0.025em] text-foreground">
                            {t('addFriend.subtitle1')}
                        </span>
                        <span className="text-[20px] font-semibold leading-[1.35] tracking-[-0.025em] text-foreground">
                            {t('addFriend.subtitle2')}
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
                        <div className="flex items-center rounded-[10px] border border-border bg-background px-3 py-3">
                            <input
                                value={formatPhoneNumber(phoneDigits)}
                                onChange={e => handlePhoneChange(e.target.value)}
                                placeholder={t('addFriend.phonePlaceholder')}
                                type="tel"
                                className="flex-1 text-[16px] font-normal leading-[1.45] tracking-[-0.015em] text-foreground placeholder:text-muted-foreground outline-none bg-transparent"
                            />
                            <span className="text-[13px] font-medium tracking-[0.019em] text-muted-foreground opacity-74 shrink-0">
                                {phoneDigits.length}/{PHONE_DIGITS_MAX}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="px-4 pt-5 pb-4">
                    <button
                        onClick={handleShare}
                        disabled={isDisabled}
                        className="w-full rounded-full py-3 text-[16px] font-semibold leading-[1.375] tracking-[0.005em] text-center transition-colors
                            disabled:bg-muted disabled:text-muted-foreground
                            enabled:bg-[#B0EA10] enabled:text-[#222325]"
                    >
                        {isPending ? '...' : t('addFriend.share')}
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
};
