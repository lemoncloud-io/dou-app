import React, { useState } from 'react';

import { SendButton } from './SendButton';

interface EmailInputProps {
    value?: string;
    onSend?: (email: string) => void;
}

export const EmailInput: React.FC<EmailInputProps> = ({ value: initialValue = '', onSend }) => {
    const [email, setEmail] = useState(initialValue);
    const [isFocused, setIsFocused] = useState(false);

    const handleSend = () => {
        if (email && onSend) {
            onSend(email);
        }
    };

    return (
        <div className="relative">
            <div
                className={`bg-white rounded-t-2xl border-t transition-all ${
                    isFocused ? 'border-[#3968c3] shadow-[0px_0px_3px_20px_#c7daff]' : 'border-[#3968c3]'
                }`}
            >
                <div className="flex items-center">
                    <div className="flex-1 px-4 py-2.5">
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => setIsFocused(false)}
                            placeholder=" "
                            className="w-full text-[14px] text-[#3A3C40] placeholder-[#BABCC0] focus:outline-none"
                            style={{ fontFamily: 'Pretendard, sans-serif' }}
                        />
                    </div>
                    <div className="pr-4">
                        <div className="bg-[#EAEAEC] rounded-full p-0.5">
                            <SendButton disabled={!email} onClick={handleSend} />
                        </div>
                    </div>
                </div>
            </div>
            {email && (
                <div className="absolute -top-12 right-4">
                    <div className="bg-[#FDFDFD] border border-[#3968c3] rounded-[36px] px-3 py-1.5 shadow-[0px_0px_3px_20px_#c7daff]">
                        <span className="text-[14px] text-[#3A3C40]" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                            {email}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};
