import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { webCore, useOnboardingStore } from '@chatic/web-core';
import { useWebSocketV2 } from '@chatic/socket';

interface SettingsDialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
    const { t } = useTranslation();
    const [tokenInput, setTokenInput] = useState('');
    const [currentToken, setCurrentToken] = useState<string | null>(null);
    const { connectionStatus, send, lastMessage } = useWebSocketV2();
    const { resetOnboarding } = useOnboardingStore();

    useEffect(() => {
        webCore
            .getTokenStorage()
            .getCachedOAuthToken()
            .then(token => {
                setCurrentToken(token?.identityToken ?? null);
            });
    }, []);

    const handleUpdateToken = () => {
        if (!tokenInput.trim()) return;
        void webCore.getTokenStorage().saveOAuthToken({ identityToken: tokenInput.trim() } as never);

        send({
            type: 'auth',
            action: 'update',
            payload: {
                token: tokenInput.trim(),
                dryRun: false,
            },
        });

        setTokenInput('');
    };

    const getStatusColor = () => {
        switch (connectionStatus) {
            case 'connected':
                return 'bg-green-500';
            case 'connecting':
                return 'bg-yellow-500';
            case 'disconnected':
                return 'bg-red-500';
            default:
                return 'bg-gray-500';
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent hideClose variant="slide-up" className="max-w-full w-full m-0 rounded-none bg-background">
                <DialogDescription className="sr-only">App settings and configuration</DialogDescription>
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                        <DialogTitle className="text-xl font-semibold text-foreground">
                            {t('settingsDialog.title')}
                        </DialogTitle>
                        <button
                            onClick={() => onOpenChange?.(false)}
                            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted"
                        >
                            <X className="w-5 h-5 text-foreground" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
                        {/* WebSocket Status */}
                        <div className="flex flex-col gap-3">
                            <h3 className="text-base font-semibold text-foreground">{t('settingsDialog.wsStatus')}</h3>
                            <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                                <div className={`w-4 h-4 rounded-full ${getStatusColor()}`} />
                                <span className="text-sm font-medium text-foreground">{connectionStatus}</span>
                            </div>
                            {lastMessage && (
                                <details className="group">
                                    <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                                        {t('settingsDialog.viewLastMessage')}
                                    </summary>
                                    <div className="mt-2 text-xs text-muted-foreground break-all max-h-60 overflow-auto p-3 bg-muted rounded border border-border">
                                        <pre className="whitespace-pre-wrap">
                                            {JSON.stringify(lastMessage, null, 2)}
                                        </pre>
                                    </div>
                                </details>
                            )}
                        </div>

                        {/* Token Editor */}
                        <div className="flex flex-col gap-3">
                            <h3 className="text-base font-semibold text-foreground">Identity Token</h3>
                            <div className="p-3 bg-muted rounded-lg border border-border">
                                <p className="text-xs text-muted-foreground break-all font-mono">
                                    {currentToken || t('settingsDialog.noToken')}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    value={tokenInput}
                                    onChange={e => setTokenInput(e.target.value)}
                                    placeholder={t('settingsDialog.newTokenPlaceholder')}
                                    className="flex-1 h-11"
                                />
                                <Button
                                    onClick={handleUpdateToken}
                                    disabled={!tokenInput.trim()}
                                    className="bg-[#B0EA10] hover:bg-[#9DD00E] text-[#222325] h-11 px-6 disabled:opacity-50"
                                >
                                    {t('settingsDialog.change')}
                                </Button>
                            </div>
                        </div>

                        {/* Onboarding */}
                        <div className="flex flex-col gap-3">
                            <h3 className="text-base font-semibold text-foreground">
                                {t('settingsDialog.onboarding')}
                            </h3>
                            <Button
                                onClick={() => {
                                    resetOnboarding();
                                    onOpenChange?.(false);
                                }}
                                variant="outline"
                                className="h-11 border-border text-foreground"
                            >
                                {t('settingsDialog.resetOnboarding')}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
