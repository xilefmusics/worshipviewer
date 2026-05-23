import { describe, expect, it } from 'vitest'

import { collectBlobIdsFromPlayer } from '@/lib/offline/collect-blob-ids'

describe('collectBlobIdsFromPlayer', () => {
  it('collects blob ids and song attachment ids', () => {
    const player = {
      between_items: false,
      index: 0,
      orientation: 'portrait' as const,
      scroll_type: 'book' as const,
      scroll_type_cache_other_orientation: 'book' as const,
      toc: [],
      items: [
        { type: 'blob' as const, blob_id: 'b-sheet' },
        {
          type: 'chords' as const,
          song: {
            id: 's1',
            owner: 'o',
            not_a_song: false,
            blobs: [{ id: 'att1' }, { id: 'att2' }],
            data: {
              artists: [],
              languages: ['en'],
              sections: [],
              tags: {},
              titles: ['Test'],
            },
            user_specific_addons: { liked: false },
          },
        },
      ],
    }
    const ids = collectBlobIdsFromPlayer(player)
    expect(ids.sort()).toEqual(['att1', 'att2', 'b-sheet'].sort())
  })
})
