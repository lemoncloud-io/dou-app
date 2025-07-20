import React from 'react';

interface HeaderProps {
    showBorder?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ showBorder = false }) => {
    return (
        <div className="fixed top-0 left-0 right-0 z-10 bg-white">
            <div className="flex items-center justify-start px-4 py-4">
                <h1
                    className="text-[28px] font-normal tracking-[-1.38px] bg-gradient-to-r from-[#0b1933] via-[#102f6b] to-[#3968c3] bg-clip-text"
                    style={{
                        fontFamily: 'Aldrich, sans-serif',
                        WebkitTextFillColor: 'transparent',
                        backgroundImage: 'linear-gradient(to right, #0b1933 3.75%, #102f6b 46.884%, #3968c3 94.375%)',
                    }}
                >
                    Chatic
                </h1>
            </div>
            {showBorder && <div className="w-full h-[1px] bg-[#EAEAEC]" />}
        </div>
    );
};
