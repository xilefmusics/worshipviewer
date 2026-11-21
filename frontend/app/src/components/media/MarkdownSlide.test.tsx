import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MarkdownSlide } from './MarkdownSlide'

describe('MarkdownSlide', () => {
  it('renders Markdown and GFM without HTML or remote images', () => {
    const { container } = render(<MarkdownSlide source={'# Heading\n\n**Bold**\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n![image](https://example.com/x.png)\n\n<script>alert(1)</script>'} />)
    expect(screen.getByRole('heading', { name: 'Heading' })).toBeInTheDocument()
    expect(screen.getByText('Bold').tagName).toBe('STRONG')
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(container.querySelector('img, script')).toBeNull()
  })
})
