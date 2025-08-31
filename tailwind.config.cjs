/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './templates/**/*.html',
    './templates/*.html',
    './static/js/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        'epic-pink': '#FF1393',
        'epic-gray': '#AAAAAA',
        'epic-white': '#FFFFFF',
      },
      fontFamily: {
        sans: ['Montserrat', 'system-ui', 'sans-serif'],
      },
    },
  },
  daisyui: {
    themes: [
      {
        epicmap: {
          primary: '#FF1393',
          secondary: '#AAAAAA',
          accent: '#FFFFFF',
          neutral: '#2B2D31',
          'base-100': '#FFFFFF',
          info: '#3ABFF8',
          success: '#36D399',
          warning: '#FBBD23',
          error: '#F87272',
        },
      },
    ],
  },
  plugins: [require('daisyui')],
};

