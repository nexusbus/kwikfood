import React from 'react';

interface LogoProps {
    className?: string;
    size?: number | string;
    variant?: 'icon' | 'full';
    color?: 'primary' | 'white' | 'secondary' | 'dark' | 'current';
}

const Logo: React.FC<LogoProps> = ({
    className = '',
    size = 40,
    variant = 'icon',
    color = 'primary'
}) => {
    const colorMap = {
        primary: 'var(--primary)',
        white: '#FFFFFF',
        secondary: 'var(--secondary)',
        dark: '#0F172A',
        current: 'currentColor'
    };

    const fillColor = colorMap[color];

    return (
        <div className={`flex items-center gap-3 ${className}`} style={{ height: size }}>
            <svg
                viewBox="0 0 100 100"
                height={size}
                width={size}
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                {/* Left vertical bar of K */}
                <rect x="15" y="15" width="22" height="70" rx="4" fill={fillColor} />

                {/* Top Leg (Top Bun) */}
                <path d="M42 42L75 15C78 15 85 18 85 22L55 42H42Z" fill={fillColor} />

                {/* Inner Burger Details (Stylized) */}
                <rect x="42" y="46" width="25" height="8" rx="2" fill={fillColor} />

                {/* Bottom Leg (Bottom Bun) */}
                <path d="M42 58H58L85 78C85 82 78 85 75 85L42 58Z" fill={fillColor} />
            </svg>

            {variant === 'full' && (
                <span
                    className="font-black tracking-tight"
                    style={{
                        fontSize: `calc(${size}px * 0.7)`,
                        color: fillColor,
                        fontFamily: 'Outfit, sans-serif'
                    }}
                >
                    Kwikfood
                </span>
            )}
        </div>
    );
};

export default Logo;
