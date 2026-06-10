import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Copy } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';

import { useCreateInvite } from '../hooks';

interface InviteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channelId: string;
}

// Valid Korean mobile prefixes: 010, 011, 016, 017, 018, 019
// (mirrors apps/web InviteFriendsDialog).
const KOREAN_MOBILE_PREFIXES = ['010', '011', '016', '017', '018', '019'];

/** Normalize a +82 international number to local form (0XX…). */
const normalizeKoreanPhone = (digits: string): string =>
    digits.startsWith('82') && digits.length >= 12 ? '0' + digits.slice(2) : digits;

const isValidKoreanPhone = (digits: string): boolean => {
    const normalized = normalizeKoreanPhone(digits);
    if (normalized.length < 10 || normalized.length > 11) return false;
    return KOREAN_MOBILE_PREFIXES.some(prefix => normalized.startsWith(prefix));
};

/**
 * Desktop invite: enter a phone number, generate a shareable invite link, and
 * copy it. The backend invite is recipient-bound (user.invite-batch requires a
 * phone list); the resulting `Location` link is what the other client pastes
 * into our invite-login flow.
 */
export const InviteDialog = ({ open, onOpenChange, channelId }: InviteDialogProps) => {
    const { t } = useTranslation();
    const { createInvite, isCreating } = useCreateInvite();
    const [alias, setAlias] = useState('');
    const [link, setLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [isError, setIsError] = useState(false);

    // Reset transient state whenever the dialog closes.
    useEffect(() => {
        if (!open) {
            setAlias('');
            setLink('');
            setCopied(false);
            setIsError(false);
        }
    }, [open]);

    const digits = normalizeKoreanPhone(alias.replace(/\D/g, ''));
    const isValidPhone = isValidKoreanPhone(digits);
    const showInvalid = alias.trim().length > 0 && !isValidPhone;

    const handleGenerate = async () => {
        if (!isValidPhone) return;
        setIsError(false);
        setCopied(false);
        try {
            const generated = await createInvite(channelId, digits);
            setLink(generated);
            await navigator.clipboard.writeText(generated);
            setCopied(true);
        } catch {
            setIsError(true);
        }
    };

    const handleCopy = async () => {
        if (!link) return;
        await navigator.clipboard.writeText(link);
        setCopied(true);
    };

    return (
        <Dialog open={open} onOpenChange={next => !isCreating && onOpenChange(next)}>
            <DialogContent className="sm:max-w-md">
                <DialogTitle>{t('channels.invite.title')}</DialogTitle>
                <DialogDescription>{t('channels.invite.description')}</DialogDescription>
                <div className="flex flex-col gap-3 pt-2">
                    <Input
                        value={alias}
                        onChange={e => setAlias(e.target.value)}
                        placeholder={t('channels.invite.targetPlaceholder')}
                        disabled={isCreating}
                    />

                    {link && (
                        <Input
                            readOnly
                            value={link}
                            onFocus={e => e.currentTarget.select()}
                            onClick={() => void handleCopy()}
                        />
                    )}

                    {showInvalid && <p className="text-sm text-destructive">{t('channels.invite.invalidPhone')}</p>}

                    {isError && <p className="text-sm text-destructive">{t('channels.invite.failed')}</p>}

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isCreating}>
                            {t('channels.invite.close')}
                        </Button>
                        <Button type="button" onClick={handleGenerate} disabled={isCreating || !isValidPhone}>
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                            {isCreating
                                ? t('channels.invite.creating')
                                : copied
                                  ? t('channels.invite.copied')
                                  : t('channels.invite.copy')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
