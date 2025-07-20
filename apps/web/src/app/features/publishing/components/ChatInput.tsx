import React, { useState } from 'react';


interface ChatInputProps {
    placeholder?: string;
    onSend?: (message: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ placeholder = '이메일을 입력해주세요', onSend }) => {
    const [value, setValue] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    const handleSend = () => {
        if (value.trim() && onSend) {
            onSend(value);
            setValue('');
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white px-4 py-4">
            <div
                className={`flex items-center border-2 rounded-full px-5 py-3 transition-all ${
                    isFocused ? 'border-[#3968c3]' : 'border-[#E5E7EB]'
                }`}
            >
                <input
                    type="text"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    onKeyPress={handleKeyPress}
                    placeholder={placeholder}
                    className="flex-1 bg-transparent text-[16px] text-[#3A3C40] placeholder-[#BABCC0] focus:outline-none"
                    style={{ fontFamily: 'Pretendard, sans-serif' }}
                />
                <div className="ml-3">
                    <button
                        onClick={handleSend}
                        disabled={!value.trim()}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                            value.trim() ? 'bg-[#3968c3]' : 'bg-[#EAEAEC]'
                        }`}
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path
                                d="M2 8L14 8M14 8L8 2M14 8L8 14"
                                stroke={value.trim() ? 'white' : '#BABCC0'}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};
