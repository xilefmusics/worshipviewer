import type { SVGProps } from 'react'

export function TimerIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="14" r="8" />
      <path d="M12 10v4l2.5 1.5M10 2h4M12 6V4M19 7l1.5-1.5" />
    </svg>
  )
}
