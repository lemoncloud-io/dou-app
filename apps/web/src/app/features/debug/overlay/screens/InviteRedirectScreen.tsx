import { ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';

import { buildInviteRedirectUrl, DEFAULT_INVITE_REDIRECT_BASE } from '../../lib';
import { inviteRedirectErrorText, useInviteRedirectStrings } from '../../i18n/screens/InviteRedirectScreen';

export const InviteRedirectScreen = () => {
    const strings = useInviteRedirectStrings();
    const [input, setInput] = useState('');
    const [baseUrl, setBaseUrl] = useState(DEFAULT_INVITE_REDIRECT_BASE);

    const { url, error } = useMemo(() => {
        if (!input.trim()) return { url: '', error: '' };
        try {
            return { url: buildInviteRedirectUrl(input, baseUrl), error: '' };
        } catch (e) {
            const message = e instanceof Error ? e.message : '';
            return { url: '', error: inviteRedirectErrorText(strings, message) };
        }
    }, [input, baseUrl, strings]);

    const handleRedirect = () => {
        if (url) window.location.href = url;
    };

    return (
        <div className="flex h-full flex-col bg-background">
            <div className="flex-1 px-4">
                <div className="mb-6 mt-6">
                    <h1 className="text-[20px] font-semibold leading-[1.35]">{strings.title}</h1>
                    <p className="mt-1 text-[13px] text-muted-foreground">{strings.description}</p>
                </div>

                <div className="flex flex-col gap-5">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[14px] font-semibold text-foreground">{strings.inputLinkLabel}</span>
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            rows={4}
                            placeholder={strings.inputPlaceholder}
                            className="w-full resize-none break-all rounded-xl border border-border bg-background px-4 py-3 text-[13px] text-foreground outline-none transition-colors focus:border-foreground"
                        />
                    </label>

                    <label className="flex flex-col gap-1.5">
                        <span className="text-[14px] font-semibold text-foreground">{strings.redirectDomainLabel}</span>
                        <input
                            type="text"
                            value={baseUrl}
                            onChange={e => setBaseUrl(e.target.value)}
                            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[13px] text-foreground outline-none transition-colors focus:border-foreground"
                        />
                    </label>

                    {error && <p className="text-[13px] text-destructive">{error}</p>}
                    {url && (
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[14px] font-semibold text-foreground">
                                {strings.conversionResultLabel}
                            </span>
                            <p className="break-all rounded-xl bg-muted px-4 py-3 text-[12px] text-muted-foreground">
                                {url}
                            </p>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleRedirect}
                        disabled={!url}
                        className="flex items-center justify-center gap-1.5 rounded-2xl bg-[#B0EA10] py-4 text-[15px] font-semibold text-foreground transition-all active:scale-[0.98] disabled:bg-muted disabled:text-muted-foreground disabled:active:scale-100"
                    >
                        <ExternalLink size={18} />
                        <span>{strings.convertAndGo}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
