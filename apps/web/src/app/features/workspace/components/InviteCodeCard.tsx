import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface InviteCodeCardProps {
    code: string;
    label?: string;
}

export const InviteCodeCard = ({ code, label = '초대 코드' }: InviteCodeCardProps) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="rounded-xl bg-muted p-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
            <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-lg font-bold tracking-widest text-foreground">{code}</span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-all active:scale-95"
                >
                    {copied ? (
                        <>
                            <Check size={14} className="text-accent" />
                            복사됨
                        </>
                    ) : (
                        <>
                            <Copy size={14} />
                            복사
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
