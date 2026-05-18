import type { components } from '@/api/schema'

import { api } from '@/api/client'
import { uploadBlobImageData } from '@/api/blob-data'
import { parseProblemResponse } from '@/api/problem'

type FileType = components['schemas']['FileType']

function mimeToFileType(mime: string): FileType | null {
  const m = mime.toLowerCase().split(';')[0]?.trim() ?? ''
  if (m === 'image/png') return 'PNG'
  if (m === 'image/jpeg' || m === 'image/jpg') return 'JPEG'
  if (m === 'image/svg+xml') return 'SVG'
  return null
}

function fileTypeFromFileName(name: string): FileType | null {
  const lower = name.toLowerCase()
  if (lower.endsWith('.png')) return 'PNG'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'JPEG'
  if (lower.endsWith('.svg')) return 'SVG'
  return null
}

function resolveFileType(file: File): FileType | null {
  return mimeToFileType(file.type) ?? fileTypeFromFileName(file.name)
}

function loadImageNaturalSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (!w || !h) {
        reject(new Error('dimensions'))
        return
      }
      resolve({ width: w, height: h })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode'))
    }
    img.src = url
  })
}

/**
 * Create blob metadata, upload image bytes, return blob id for `Collection.cover` / similar fields.
 * @param ownerTeamId Owning team for the blob (library write required); omit for caller’s personal team.
 */
export async function createCoverBlobFromImageFile(
  file: File,
  opts: { ownerTeamId?: string },
): Promise<string> {
  const file_type = resolveFileType(file)
  if (!file_type) {
    throw new Error('unsupported_type')
  }
  const { width, height } = await loadImageNaturalSize(file)
  const body: components['schemas']['CreateBlob'] = {
    file_type,
    width,
    height,
    ocr: '',
  }
  if (opts.ownerTeamId) body.owner = opts.ownerTeamId

  const { data, response } = await api.POST('/api/v1/blobs', { body })
  if (!response.ok) {
    const problem = await parseProblemResponse(response.clone())
    throw new Error(problem?.title ?? 'create_failed')
  }
  if (!data?.id) throw new Error('create_failed')

  const buf = await file.arrayBuffer()
  const ok = await uploadBlobImageData(data.id, buf)
  if (!ok) throw new Error('upload_failed')

  return data.id
}
