/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ['class'],
    content: [
        './index.html',
        './src/**/*.{js,jsx,ts,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                background: 'var(--background)',
                foreground: 'var(--foreground)',
                muted: {
                    DEFAULT: 'var(--muted)',
                    foreground: 'var(--muted-foreground)'
                },
                card: {
                    DEFAULT: 'var(--card)',
                    foreground: 'var(--card-foreground)'
                },
                accent: {
                    DEFAULT: 'var(--accent)',
                    foreground: 'var(--accent-foreground)'
                },
                border: 'var(--border)',
                ring: 'var(--ring)',
                success: {
                    DEFAULT: 'var(--success)',
                    foreground: 'var(--success-foreground)'
                },
                warning: {
                    DEFAULT: 'var(--warning)',
                    foreground: 'var(--warning-foreground)'
                },
                danger: {
                    DEFAULT: 'var(--danger)',
                    foreground: 'var(--danger-foreground)'
                }
            },
            boxShadow: {
                'layer-sm': '0 10px 35px -24px rgba(15, 23, 42, 0.35)',
                'layer-md': '0 20px 45px -25px rgba(15, 23, 42, 0.45)',
                'focus-ring': '0 0 0 3px rgba(20, 83, 45, 0.25)'
            },
            backdropBlur: {
                xs: '2px'
            },
            borderRadius: {
                xl: '1.25rem',
                '2xl': '1.75rem'
            },
            fontFamily: {
                display: ['"Inter var"', 'Inter', 'system-ui', 'sans-serif'],
                body: ['"Inter var"', 'Inter', 'system-ui', 'sans-serif']
            },
            fontSize: {
                fluid: 'clamp(0.95rem, 0.25vw + 0.85rem, 1.05rem)',
                'fluid-lg': 'clamp(1.25rem, 0.5vw + 1.05rem, 1.6rem)',
                'fluid-xl': 'clamp(1.8rem, 1vw + 1.6rem, 2.4rem)'
            },
            keyframes: {
                'fade-in': {
                    from: { opacity: 0, transform: 'translateY(4px)' },
                    to: { opacity: 1, transform: 'translateY(0)' }
                },
                'pulse-soft': {
                    '0%, 100%': { opacity: 0.35 },
                    '50%': { opacity: 0.7 }
                }
            },
            animation: {
                'fade-in': 'fade-in 220ms ease-out forwards',
                'pulse-soft': 'pulse-soft 1.8s ease-in-out infinite'
            },
            transitionTimingFunction: {
                'ease-out-soft': 'cubic-bezier(0.22, 0.68, 0, 1.01)'
            },
            backgroundImage: {
                'layer-gradient': 'linear-gradient(135deg, rgba(248, 250, 252, 0.85), rgba(236, 242, 247, 0.7))'
            }
        }
    },
    plugins: [],
};