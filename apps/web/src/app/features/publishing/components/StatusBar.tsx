import React from 'react';

interface StatusBarProps {
    time?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({ time = '12:30' }) => {
    return (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[360px] flex items-center justify-between px-3 py-1 bg-white">
            <div
                className="font-medium text-[14px] text-[#1f1f3c] tracking-[0.014px]"
                style={{ fontFamily: 'Roboto, sans-serif' }}
            >
                {time}
            </div>
            <div className="flex items-center gap-1">
                <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                    <rect x="1" y="4" width="14" height="8" stroke="#1F1F3C" strokeWidth="1" />
                    <rect x="0.5" y="5.5" width="1" height="5" fill="#1F1F3C" />
                    <rect x="14.5" y="5.5" width="1" height="5" fill="#1F1F3C" />
                    <rect x="15.5" y="6.5" width="0.5" height="3" fill="#1F1F3C" />
                </svg>
                <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                    <path
                        d="M1 11 L3 8 L5 10 L7 7 L9 9 L11 6 L13 8 L15 5"
                        stroke="#1F1F3C"
                        strokeWidth="1.5"
                        fill="none"
                    />
                </svg>
                <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
                    <rect x="2" y="2" width="16" height="8" rx="1" stroke="#1F1F3C" strokeWidth="1.5" fill="none" />
                    <rect x="18" y="4.5" width="1" height="3" rx="0.5" fill="#1F1F3C" />
                    <rect x="4" y="4" width="10" height="4" rx="0.5" fill="#1F1F3C" />
                </svg>
            </div>
        </div>
    );
};
