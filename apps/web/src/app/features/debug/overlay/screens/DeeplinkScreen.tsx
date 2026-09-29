import { useCallback, useState } from 'react';

import { ExternalLink } from 'lucide-react';

import { isNative } from '@chatic/bridges';

import { buildAppDeeplink } from '../../lib';
import { appBridge } from '../../../../bridge';
import { useDeeplinkScreenStrings } from '../../i18n/screens/DeeplinkScreen';

/**
 * Hands the app a deeplink as if the OS had just delivered one — the app's Deeplink Test screen,
 * moved here (ADR-0080 decision 11).
 *
 * `openURL` is the whole mechanism: the OS resolves the scheme back to this app, so the routing
 * that runs is the same routing a real invite link or push tap triggers. No dedicated command
 * exists because none is needed (see `OpenURLPayload`).
 *
 * Different tool from "Invite link conversion": that one converts a share link and navigates the WEB, this one
 * exercises the APP's inbound routing.
 */
const PRESET_INPUTS = [
    { key: 'home', input: '/home' },
    { key: 'chatList', input: '/chats' },
    // Absolute on purpose: verifying the other channel's scheme does NOT capture this build is a
    // case worth running, and `buildAppDeeplink` passes an explicit scheme through untouched.
    { key: 'prodCrossCheck', input: 'chatic://s' },
    { key: 'devCrossCheck', input: 'chatic-dev://s' },
] as const;

export const DeeplinkScreen = () => {
    const isOnNative = isNative();
    const [input, setInput] = useState('/home');
    const [log, setLog] = useState<string[]>([]);
    const strings = useDeeplinkScreenStrings();

    const open = useCallback(
        (raw: string) => {
            const url = buildAppDeeplink(raw);
            if (!url) return;
            appBridge.openURL(url);
            // `openURL` is fire-and-forget (`webClient.post`), so this line records what was SENT.
            // Whether the app routed it shows up in the app itself — saying "Routed" here would be a
            // claim this screen cannot make.
            setLog(prev => [`${new Date().toLocaleTimeString()}  ${strings.sentLine(url)}`, ...prev].slice(0, 20));
        },
        [strings]
    );

    const presets = PRESET_INPUTS.map(preset => ({ ...preset, label: strings.presets[preset.key] }));

    return (
        <div className="flex h-full flex-col bg-background">
            <div className="flex-1 px-4">
                <div className="mb-6 mt-6">
                    <h1 className="text-[20px] font-semibold leading-[1.35]">{strings.title}</h1>
                    <p className="mt-1 text-[13px] text-muted-foreground">{strings.subtitle(isOnNative)}</p>
                </div>

                <div className="flex flex-col gap-5">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[14px] font-semibold text-foreground">{strings.fieldLabel}</span>
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder={strings.placeholder}
                            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[13px] text-foreground outline-none transition-colors focus:border-foreground"
                        />
                        <span className="break-all text-[12px] text-muted-foreground">
                            {strings.willSend(buildAppDeeplink(input) || '—')}
                        </span>
                    </label>

                    <button
                        type="button"
                        onClick={() => open(input)}
                        disabled={!buildAppDeeplink(input)}
                        className="flex items-center justify-center gap-1.5 rounded-2xl bg-[#B0EA10] py-4 text-[15px] font-semibold text-foreground transition-all active:scale-[0.98] disabled:bg-muted disabled:text-muted-foreground disabled:active:scale-100"
                    >
                        <ExternalLink size={18} />
                        <span>{strings.sendToApp}</span>
                    </button>

                    <div className="flex flex-col gap-1.5">
                        <span className="text-[14px] font-semibold text-foreground">{strings.commonOnes}</span>
                        <div className="flex flex-wrap gap-2">
                            {presets.map(preset => (
                                <button
                                    key={preset.key}
                                    type="button"
                                    onClick={() => open(preset.input)}
                                    className="rounded-md border border-border px-2 py-1 text-xs"
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <span className="text-[14px] font-semibold text-foreground">{strings.sentLogTitle}</span>
                        {log.length === 0 ? (
                            <p className="text-[13px] text-muted-foreground">{strings.nothingSentYet}</p>
                        ) : (
                            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-muted px-4 py-3 font-mono text-[12px] text-muted-foreground">
                                {log.join('\n')}
                            </pre>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
