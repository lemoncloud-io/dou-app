import { useState } from 'react';
import { normalizeName } from '../naming';

interface Props {
    title: string;
    label: string;
    /** Prefilled value for edit flows; empty for create flows. */
    initialValue?: string;
    submitLabel?: string;
    /** Runs the write. Rejecting surfaces the error inline and keeps the dialog open. */
    onSubmit: (name: string) => Promise<void>;
    onClose: () => void;
}

const inputClass =
    'w-full border border-border bg-background rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary';

// Shared modal for the testbed name-only create/edit flows (channel/place). Create vs edit differ
// only by the initial value, so a single dialog covers both. Submit is gated by the shared
// normalizeName rule; a failing write keeps the dialog open and shows the message.
export const NameFormDialog = ({ title, label, initialValue = '', submitLabel = '저장', onSubmit, onClose }: Props) => {
    const [name, setName] = useState(initialValue);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isValid = normalizeName(name) !== null;

    const handleSubmit = async () => {
        if (!isValid || saving) return;
        setError(null);
        setSaving(true);
        try {
            await onSubmit(name);
            onClose();
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="w-full max-w-sm rounded-2xl bg-card border border-border p-4 space-y-3"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{title}</span>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground text-lg leading-none"
                    >
                        ✕
                    </button>
                </div>

                <label className="block space-y-1">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <input
                        autoFocus
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') void handleSubmit();
                        }}
                        placeholder="이름"
                        className={inputClass}
                    />
                </label>

                {error && <p className="text-xs text-destructive break-words">{error}</p>}

                <button
                    onClick={() => void handleSubmit()}
                    disabled={!isValid || saving}
                    className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-80"
                >
                    {saving ? '저장 중...' : submitLabel}
                </button>
            </div>
        </div>
    );
};
