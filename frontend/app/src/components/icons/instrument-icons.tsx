import type { SVGProps } from 'react'

type InstrumentIconProps = SVGProps<SVGSVGElement> & {
  size?: number
}

export function GuitarIcon({ size = 28, ...props }: InstrumentIconProps) {
  return (
    <svg
      aria-hidden
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="m14.4 5.2 4.4-4.4 1.4 1.4-4.4 4.4" />
      <path d="M14.5 5.4c-1.1-.6-2.5-.4-3.4.5-.7.7-1 1.7-.8 2.6.1.6-.1 1.2-.6 1.7l-3.6 3.6c-.5.5-1.1.7-1.7.6-.9-.2-1.9.1-2.6.8-1.2 1.2-1.2 3.2 0 4.4s3.2 1.2 4.4 0c.7-.7 1-1.7.8-2.6-.1-.6.1-1.2.6-1.7l3.6-3.6c.5-.5 1.1-.7 1.7-.6.9.2 1.9-.1 2.6-.8.9-.9 1.1-2.3.5-3.4" />
      <circle cx="4.4" cy="16.8" r="1.1" />
      <path d="m8.8 11.8 3.4 3.4M10.2 10.4l3.4 3.4" />
    </svg>
  )
}

export function KeyboardIcon({ size = 28, ...props }: InstrumentIconProps) {
  return (
    <svg
      aria-hidden
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect height="14" rx="2" width="20" x="2" y="5" />
      <path d="M6 5v8M10 5v8M14 5v8M18 5v8M2 13h20M8 13v6M12 13v6M16 13v6" />
      <path d="M5 5v5M8 5v5M13 5v5M16 5v5M19 5v5" />
    </svg>
  )
}
