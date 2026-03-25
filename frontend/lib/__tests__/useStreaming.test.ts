import { beforeEach, describe, expect, it, vi } from 'vitest'

import { processSseEvent } from '@/lib/useStreaming'
import { useStore } from '@/lib/store'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

describe('processSseEvent preview handling', () => {
  beforeEach(() => {
    useStore.getState().reset()
    localStorageMock.clear()
    vi.clearAllMocks()
    useStore.getState().setActiveConversationId('conv-1')
  })

  it('opens the preview panel and records sandbox state from preview events', () => {
    processSseEvent(
      {
        type: 'preview',
        url: 'https://preview.example/app',
        sandbox_id: 'sbx-1',
      },
      {
        conversationId: 'conv-1',
        isMulti: false,
        activeModel: 'test-model',
        updateBranch: vi.fn(),
      },
    )

    const state = useStore.getState()
    expect(state.previewUrl).toBe('https://preview.example/app')
    expect(state.rightPanelTab).toBe('preview')
    expect(state.rightPanelOpen).toBe(true)
    expect(state.sandboxId).toBe('sbx-1')
    expect(state.sandboxStatus).toBe('running')
  })
})
