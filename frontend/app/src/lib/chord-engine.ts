import { createWasmChordEngine } from '@/adapters/chord-engine-wasm'
import type { ChordEngine } from '@/ports/chord-engine'

let enginePromise: Promise<ChordEngine> | null = null

/** Lazily load and cache the web ChordEngine (WASM). */
export function getChordEngine(): Promise<ChordEngine> {
  enginePromise ??= createWasmChordEngine()
  return enginePromise
}

/** @internal Vitest-only */
export function resetChordEngineSingleton(): void {
  enginePromise = null
}
