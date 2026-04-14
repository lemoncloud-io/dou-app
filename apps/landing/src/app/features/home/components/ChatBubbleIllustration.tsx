import { useCallback, useEffect, useRef, useState } from 'react';

import { Logo } from '@chatic/assets';

const DESIGN_WIDTH = 420;

export const ChatBubbleIllustration = (): JSX.Element => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(0.8);
    const [offsetX, setOffsetX] = useState(0);

    const updateScale = useCallback(() => {
        if (!containerRef.current) return;
        const width = containerRef.current.offsetWidth;
        const newScale = Math.min(width / DESIGN_WIDTH, 1);
        setScale(newScale);
        setOffsetX((width - DESIGN_WIDTH * newScale) / 2);
    }, []);

    useEffect(() => {
        updateScale();
        const observer = new ResizeObserver(updateScale);
        if (containerRef.current) observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [updateScale]);

    return (
        <div
            ref={containerRef}
            className="relative w-full mx-auto overflow-hidden"
            style={{ height: DESIGN_WIDTH * scale }}
        >
            {/* Scaled inner container — all children stay at design size */}
            <div
                className="absolute top-0"
                style={{
                    width: DESIGN_WIDTH,
                    height: DESIGN_WIDTH,
                    transformOrigin: 'top left',
                    transform: `scale(${scale})`,
                    left: offsetX,
                }}
            >
                {/* Mascot */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                    <img
                        src={Logo.logo}
                        alt="DoU mascot"
                        className="w-[180px] h-[170px] drop-shadow-2xl animate-float"
                    />
                </div>

                {/* "Hello!" bubble - top left */}
                <div
                    className="absolute top-[2%] left-[8%] bg-[#F8F8F8]
                               px-7 py-3
                               rounded-bl-[28px] rounded-br-[28px] rounded-tr-[28px] rounded-tl-none
                               shadow-[2px_3px_16px_rgba(0,0,0,0.14)]
                               animate-fade-in-up animate-delay-200"
                >
                    <span className="text-[28px] font-medium text-[#171725]">Hello!</span>
                </div>

                {/* "Welcome~" bubble - top right */}
                <div
                    className="absolute top-[12%] right-[3%] bg-navy
                               px-7 py-3
                               rounded-bl-[28px] rounded-br-[28px] rounded-tl-[28px] rounded-tr-none
                               shadow-[2px_3px_16px_rgba(0,0,0,0.14)]
                               animate-fade-in-up animate-delay-300"
                >
                    <span className="text-[28px] font-medium text-white">Welcome~</span>
                </div>

                {/* Bottom-left emoji bubble - 🤝🫶 */}
                <div
                    className="absolute bottom-[3%] left-[8%] bg-[#F8F8F8]
                               px-7 py-3
                               rounded-bl-[28px] rounded-br-[28px] rounded-tr-[28px] rounded-tl-none
                               shadow-[2px_3px_16px_rgba(0,0,0,0.14)]
                               animate-fade-in animate-delay-400"
                >
                    <span role="img" aria-label="handshake and heart hands" className="text-[28px] tracking-[5px]">
                        🤝🫶
                    </span>
                </div>

                {/* Bottom-right emoji bubble - 😊☺️ */}
                <div
                    className="absolute bottom-[8%] right-[5%] bg-navy
                               px-7 py-3
                               rounded-bl-[28px] rounded-br-[28px] rounded-tl-[28px] rounded-tr-none
                               animate-fade-in animate-delay-500"
                >
                    <span role="img" aria-label="smiling faces" className="text-[28px] tracking-[5px]">
                        😊☺️
                    </span>
                </div>
            </div>
        </div>
    );
};
