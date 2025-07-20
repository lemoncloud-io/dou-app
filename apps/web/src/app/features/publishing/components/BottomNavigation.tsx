import React from 'react';

export const BottomNavigation: React.FC = () => {
    return (
        <div className="absolute bottom-0 left-0 w-[360px] h-12">
            <div className="flex items-center justify-between px-[73px] py-4 bg-[#EAEAEC]">
                <button className="p-0">
                    <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
                        <path d="M2 1 L0 3 L2 5 M0 3 L12 3" stroke="#84888F" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                </button>
                <button className="p-0">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="6" stroke="#84888F" strokeWidth="1.5" fill="none" />
                    </svg>
                </button>
                <button className="p-0">
                    <div className="w-3.5 h-3.5 bg-[#84888F] rounded-sm" />
                </button>
            </div>
        </div>
    );
};
