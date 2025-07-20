import React from 'react';

interface ChatMessageProps {
    message: string;
    type: 'system' | 'user';
    gradient?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, type, gradient = false }) => {
    if (type === 'system') {
        return (
            <div className="mb-1">
                {gradient ? (
                    <p
                        className="text-[16px] font-semibold leading-[1.6] bg-gradient-to-r from-[#0b1933] via-[#102f6b] to-[#3968c3] bg-clip-text"
                        style={{
                            fontFamily: 'Pretendard, sans-serif',
                            WebkitTextFillColor: 'transparent',
                            backgroundImage:
                                'linear-gradient(to right, #0b1933 1.042%, #102f6b 22.278%, #3968c3 45.66%)',
                        }}
                    >
                        {message}
                    </p>
                ) : (
                    <p
                        className="text-[16px] text-[#3A3C40] leading-[1.6]"
                        style={{ fontFamily: 'Pretendard, sans-serif' }}
                    >
                        {message}
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className="flex justify-end mb-4">
            <div className="bg-[#FDFDFD] border border-[#3968c3] rounded-[36px] px-4 py-2 shadow-[0px_0px_3px_20px_#c7daff]">
                <span className="text-[14px] text-[#3A3C40]" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                    {message}
                </span>
            </div>
        </div>
    );
};
