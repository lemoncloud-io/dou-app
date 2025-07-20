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
        <div
            className="fixed bottom-0 left-0 right-0"
            style={{
                backgroundColor: '#FFFFFF',
                padding: '16px',
            }}
        >
            <div
                className="flex items-center transition-all"
                style={{
                    border: `2px solid ${isFocused ? '#3968c3' : '#E5E7EB'}`,
                    borderRadius: '100px',
                    padding: '12px 20px',
                    transition: 'all 0.2s ease',
                }}
            >
                <input
                    type="text"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    onKeyPress={handleKeyPress}
                    placeholder={placeholder}
                    className="flex-1 bg-transparent focus:outline-none"
                    style={{
                        fontFamily: 'Pretendard, sans-serif',
                        fontSize: '16px',
                        fontWeight: 400,
                        lineHeight: 1.5,
                        color: '#3A3C40',
                    }}
                />
                <div style={{ marginLeft: '12px' }}>
                    <button
                        onClick={handleSend}
                        disabled={!value.trim()}
                        className="flex items-center justify-center transition-colors"
                        style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '100px',
                            padding: '8px',
                            backgroundColor: value.trim() ? '#3968c3' : '#EAEAEC',
                            transition: 'all 0.2s ease',
                            cursor: value.trim() ? 'pointer' : 'not-allowed',
                            opacity: value.trim() ? 1 : 0.4,
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path
                                d="M2 8L14 8M14 8L8 2M14 8L8 14"
                                stroke={value.trim() ? '#FFFFFF' : '#BABCC0'}
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
