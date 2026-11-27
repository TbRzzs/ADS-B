import type { ReactNode } from 'react';

// Iconos de línea (24×24). JSX estático creado una sola vez a nivel de módulo.
const svg = (children: ReactNode) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const IconCenter = svg(
  <>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </>,
);

export const IconRecenter = svg(
  <>
    <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" />
    <circle cx="12" cy="12" r="3" />
  </>,
);

export const IconCamera = svg(
  <>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </>,
);

export const IconBell = svg(
  <>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </>,
);

export const IconBellOff = svg(
  <>
    <path d="M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l2 2H8" />
    <path d="M10 20a2 2 0 0 0 4 0M3 3l18 18" />
  </>,
);

export const IconSettings = svg(
  <>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </>,
);

export const IconList = svg(<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />);

export const IconClose = svg(<path d="M6 6l12 12M18 6 6 18" />);
