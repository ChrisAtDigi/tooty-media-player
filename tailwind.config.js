/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      // TV-first font scale — everything reads from across the room
      fontSize: {
        'xs':   ['0.875rem',  { lineHeight: '1.4' }],  // 14px
        'sm':   ['1rem',      { lineHeight: '1.4' }],  // 16px
        'base': ['1.25rem',   { lineHeight: '1.5' }],  // 20px  ← default body text
        'lg':   ['1.5rem',    { lineHeight: '1.4' }],  // 24px
        'xl':   ['1.875rem',  { lineHeight: '1.3' }],  // 30px
        '2xl':  ['2.25rem',   { lineHeight: '1.2' }],  // 36px
        '3xl':  ['3rem',      { lineHeight: '1.1' }],  // 48px
        '4xl':  ['3.75rem',   { lineHeight: '1.1' }],  // 60px
        '5xl':  ['4.5rem',    { lineHeight: '1' }],    // 72px
      },
      colors: {
        // Dark TV palette
        surface: {
          DEFAULT: '#0d0d0d',
          raised:  '#1a1a1a',
          overlay: '#242424',
        },
        accent: {
          DEFAULT: '#e5b95a',   // warm gold — visible on dark backgrounds
          hover:   '#f0ca7a',
        },
        focus: {
          ring: '#e5b95a',      // matches accent — D-pad focus indicator
        },
        text: {
          primary:   '#f0f0f0',
          secondary: '#a0a0a0',
          muted:     '#606060',
        },
      },
      // Thick, high-contrast focus ring for TV remote navigation
      ringWidth: {
        'tv': '4px',
      },
      ringColor: {
        'tv': '#e5b95a',
      },
      // Generous spacing scale for 10-foot UI
      spacing: {
        'safe': '4rem',       // safe area margin from TV bezel
        'card': '1.5rem',
      },
      borderRadius: {
        'card': '0.625rem',
      },
      transitionDuration: {
        'tv': '150ms',        // fast enough to feel snappy on D-pad navigation
      },
    },
  },
  // Remove hover variants — TV remotes don't hover.
  // Focus is the only interactive state that matters.
  future: {
    hoverOnlyWhenSupported: true,
  },
  plugins: [],
}
