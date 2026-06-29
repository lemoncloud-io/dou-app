import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface InviteCodeCardProps {
    code: string;
    label?: string;
}

export const InviteCodeCard = ({ code, label }: InviteCodeCardProps) => {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const displayLabel = label || t('inviteCode.label');

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="rounded-xl bg-muted p-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{displayLabel}</p>
            <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-lg font-bold tracking-widest text-foreground">{code}</span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-all active:scale-95"
                >
                    {copied ? (
                        <>
                            <Check size={14} className="text-accent" />
                            {t('inviteCode.copied')}
                        </>
                    ) : (
                        <>
                            <Copy size={14} />
                            {t('inviteCode.copy')}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
