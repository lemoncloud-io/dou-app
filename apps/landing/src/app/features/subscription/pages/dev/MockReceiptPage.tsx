import { type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Where the mock's receipt links point. A real receipt is a page the payment provider hosts; this
 * only proves the link goes somewhere. Mock-only, English, not in the copy files.
 */
export const MockReceiptPage = (): JSX.Element => {
    const [params] = useSearchParams();
    return (
        <main className="flex min-h-full items-center justify-center bg-muted p-6">
            <div className="rounded-2xl bg-card p-6 text-sm text-navy shadow-lg">
                Mock receipt for invoice <code>{params.get('invoice')}</code>
            </div>
        </main>
    );
};
