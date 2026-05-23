import type { SVGAttributes } from 'react'

type PlayIconProps = SVGAttributes<SVGSVGElement> & {
  size?: number
}

/** Simple play triangle for menus (static). */
export function PlayIcon({ size = 16, className, ...props }: PlayIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
      {...props}
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}
