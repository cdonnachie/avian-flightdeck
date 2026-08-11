/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: ['class'],
  theme: {
  	extend: {
  		fontSize: {
  			xxs: '0.625rem'
  		},
  		colors: {
  			avian: {
  				'50': '#e4fbf4',
  				'100': '#bef6e7',
  				'200': '#8defd9',
  				'300': '#34f5c6',
  				'400': '#34e2d5',
  				'500': '#17a7b6',
  				'600': '#19827a',
  				'700': '#2a737f',
  				'800': '#14666a',
  				'900': '#123e46',
  				'950': '#0d1b21',
  				primary: '#34e2d5',
  				secondary: '#19827a',
  				accent: '#17a7b6',
  				dark: '#0d1b21',
  				light: '#34f5c6',
  				/* named brand stops (Avian mainnet palette) */
  				mint: '#34f5c6',
  				turquoise: '#34e2d5',
  				cyan: '#17a7b6',
  				teal: '#19827a',
  				slate: '#2a737f',
  				/* Sodium — the secondary/accent that complements the teal */
  				gold: '#f0b44e',
  				orange: '#ef8a3c',
  				blue: '#2a8dc5',
  				red: '#f0566b',
  				/* testnet palette — reserved, only ever used on testnet */
  				testnet: {
  					violet: '#3c2c88',
  					indigo: '#2d2178',
  					blue: '#3a33bd',
  					'blue-light': '#4449cd',
  					navy: '#1f168e'
  				}
  			},
  			/* Sodium accent + caution, driven by CSS vars (theme-aware) */
  			sodium: {
  				DEFAULT: 'hsl(var(--sodium))',
  				foreground: 'hsl(var(--sodium-foreground))'
  			},
  			caution: 'hsl(var(--caution))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))',
  				avian: '#23c9c1'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))',
  				avian: '#0a7f8c'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))',
  				avian: '#1a9691'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))',
  				avian1: '#34e2d5',
  				avian2: '#f0b44e',
  				avian3: '#17a7b6',
  				avian4: '#19827a',
  				avian5: '#2a737f'
  			},
  			status: {
  				success: '#19827a',
  				warning: '#ef8a3c',
  				error: '#f0566b',
  				info: '#17a7b6',
  				pending: '#9db4bc'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		fontFamily: {
  			sans: [
  				'var(--font-inter)',
  				'Inter',
  				'-apple-system',
  				'BlinkMacSystemFont',
  				'Segoe UI',
  				'Roboto',
  				'Helvetica Neue',
  				'Arial',
  				'sans-serif'
  			],
  			mono: [
  				'var(--font-roboto-mono)',
  				'Roboto Mono',
  				'ui-monospace',
  				'Cascadia Code',
  				'Segoe UI Mono',
  				'Consolas',
  				'monospace'
  			]
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require('tailwindcss-animate')],
};
