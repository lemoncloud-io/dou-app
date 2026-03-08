import { X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { simpleWebCore, useOnboardingStore } from '@chatic/web-core';
import { useWebSocketV2 } from '@chatic/socket';

interface SettingsDialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
    const [tokenInput, setTokenInput] = useState('');
    const { connectionStatus, send, lastMessage } = useWebSocketV2();
    const { resetOnboarding } = useOnboardingStore();

    const currentToken = simpleWebCore.getToken();

    const handleUpdateToken = () => {
        if (!tokenInput.trim()) return;
        const token = simpleWebCore.getToken();
        if (token) {
            simpleWebCore.saveToken(token);

            send({
                type: 'auth',
                action: 'update',
                payload: {
                    token,
                    dryRun: false,
                },
            });

            setTokenInput('');
        }
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
            <DialogContent hideClose variant="fullscreen" className="max-w-full w-full m-0 rounded-none bg-white">
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="px-6 py-4 border-b flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-black">설정</h2>
                        <button
                            onClick={() => onOpenChange?.(false)}
                            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100"
                        >
                            <X className="w-5 h-5 text-[#3A3C40]" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
                        {/* WebSocket Status */}
                        <div className="flex flex-col gap-3">
                            <h3 className="text-base font-semibold text-gray-900">WebSocket 상태</h3>
                            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                                <div className={`w-4 h-4 rounded-full ${getStatusColor()}`} />
                                <span className="text-sm font-medium text-gray-700">{connectionStatus}</span>
                            </div>
                            {lastMessage && (
                                <details className="group">
                                    <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
                                        마지막 메시지 보기
                                    </summary>
                                    <div className="mt-2 text-xs text-gray-500 break-all max-h-60 overflow-auto p-3 bg-gray-50 rounded border">
                                        <pre className="whitespace-pre-wrap">
                                            {JSON.stringify(lastMessage, null, 2)}
                                        </pre>
                                    </div>
                                </details>
                            )}
                        </div>

                        {/* Token Editor */}
                        <div className="flex flex-col gap-3">
                            <h3 className="text-base font-semibold text-gray-900">Identity Token</h3>
                            <div className="p-3 bg-gray-50 rounded-lg border">
                                <p className="text-xs text-gray-500 break-all font-mono">
                                    {currentToken || '토큰 없음'}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    value={tokenInput}
                                    onChange={e => setTokenInput(e.target.value)}
                                    placeholder="새 토큰 입력"
                                    className="flex-1 h-11"
                                />
                                <Button
                                    onClick={handleUpdateToken}
                                    disabled={!tokenInput.trim()}
                                    className="bg-[#B0EA10] hover:bg-[#9DD00E] text-[#222325] h-11 px-6 disabled:opacity-50"
                                >
                                    변경
                                </Button>
                            </div>
                        </div>

                        {/* Onboarding */}
                        <div className="flex flex-col gap-3">
                            <h3 className="text-base font-semibold text-gray-900">온보딩</h3>
                            <Button
                                onClick={() => {
                                    resetOnboarding();
                                    onOpenChange?.(false);
                                }}
                                variant="outline"
                                className="h-11 border-[#DFE0E2] text-[#3A3C40]"
                            >
                                온보딩 다시보기
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
