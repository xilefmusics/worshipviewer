import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export interface DownloadCheckIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

/** Static download-tray icon with a checkmark for content saved offline. */
export function DownloadCheckIcon({ size = 28, className, ...props }: DownloadCheckIconProps) {
  return (
    <div className={cn(className)} {...props}>
      <svg
        fill="none"
        height={size}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width={size}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path d="M12 3v10" />
        <path d="m8 9 4 4 4-4" />
        <path d="M5 14v4a2 2 0 0 0 2 2h5" />
        <path d="m16 18 2 2 4-4" />
      </svg>
    </div>
  )
}
