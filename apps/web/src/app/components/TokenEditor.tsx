import { useState } from 'react';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { simpleWebCore } from '@chatic/web-core';

export const TokenEditor = () => {
    const [tokenInput, setTokenInput] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    const currentToken = simpleWebCore.getToken()?.identityToken || '';

    const handleUpdateToken = () => {
        if (!tokenInput.trim()) return;
        const token = simpleWebCore.getToken();
        if (token) {
            simpleWebCore.saveToken({ ...token, identityToken: tokenInput });
            setTokenInput('');
            setIsOpen(false);
            window.location.reload();
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 left-4 z-50 rounded-full bg-gray-800 px-4 py-2 text-xs text-white shadow-lg hover:bg-gray-700"
            >
                🔑 Token
            </button>
        );
    }

    return (
        <div className="fixed bottom-4 left-4 z-50 w-80 rounded-lg bg-white p-4 shadow-xl border">
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-semibold">Identity Token</h3>
                <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-700">
                    ✕
                </button>
            </div>
            <div className="text-xs text-gray-500 break-all mb-3 max-h-20 overflow-auto">{currentToken}</div>
            <div className="flex gap-2">
                <Input
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    placeholder="새 토큰 입력"
                    className="flex-1 text-sm"
                />
                <Button onClick={handleUpdateToken} className="bg-[#B0EA10] hover:bg-[#9DD00E] text-[#222325]">
                    변경
                </Button>
            </div>
        </div>
    );
};
