import { Settings } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent } from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { simpleWebCore } from '@chatic/web-core';
import { useWebSocketV2 } from '@chatic/socket';

export const SettingsDialog = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [tokenInput, setTokenInput] = useState('');
    const { connectionStatus, send } = useWebSocketV2();

    const currentToken = simpleWebCore.getToken()?.identityToken || '';

    const handleUpdateToken = () => {
        if (!tokenInput.trim()) return;
        const token = simpleWebCore.getToken();
        if (token) {
            const newToken = { ...token, identityToken: tokenInput };
            simpleWebCore.saveToken(newToken);

            send({
                type: 'auth',
                action: 'update',
                payload: {
                    token: newToken.identityToken,
                    dryRun: false,
                },
            });

            setTokenInput('');
            // window.location.reload();
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
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="fixed top-4 right-4 z-50 flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-lg hover:bg-gray-50 border"
            >
                <Settings className="w-5 h-5 text-gray-700" />
            </button>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-md">
                    <div className="flex flex-col gap-6 p-4">
                        <h2 className="text-lg font-semibold">설정</h2>

                        {/* WebSocket Status */}
                        <div className="flex flex-col gap-2">
                            <h3 className="text-sm font-semibold text-gray-700">WebSocket 상태</h3>
                            <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
                                <span className="text-sm text-gray-600">{connectionStatus}</span>
                            </div>
                        </div>

                        {/* Token Editor */}
                        <div className="flex flex-col gap-2">
                            <h3 className="text-sm font-semibold text-gray-700">Identity Token</h3>
                            <div className="text-xs text-gray-500 break-all max-h-20 overflow-auto p-2 bg-gray-50 rounded">
                                {currentToken || '토큰 없음'}
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    value={tokenInput}
                                    onChange={e => setTokenInput(e.target.value)}
                                    placeholder="새 토큰 입력"
                                    className="flex-1"
                                />
                                <Button
                                    onClick={handleUpdateToken}
                                    className="bg-[#B0EA10] hover:bg-[#9DD00E] text-[#222325]"
                                >
                                    변경
                                </Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};
