import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from '@/lib/store'
import { DEFAULT_MODEL_ID, type Conversation } from '@/lib/types'

// Mock localStorage
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

function resetStore() {
  useStore.getState().reset()
}

describe('useStore', () => {
  beforeEach(() => {
    resetStore()
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('has null user', () => {
      expect(useStore.getState().user).toBeNull()
    })

    it('has empty conversations', () => {
      expect(useStore.getState().conversations).toEqual([])
    })

    it('has null activeConversationId', () => {
      expect(useStore.getState().activeConversationId).toBeNull()
    })

    it('has empty messages', () => {
      expect(useStore.getState().messages).toEqual([])
    })

    it('uses the configured default model', () => {
      expect(useStore.getState().activeModel).toBe(DEFAULT_MODEL_ID)
    })

    it('has isStreaming false', () => {
      expect(useStore.getState().isStreaming).toBe(false)
    })

    it('has empty streaming state', () => {
      const { streaming } = useStore.getState()
      expect(streaming.content).toBe('')
      expect(streaming.reasoning).toBe('')
      expect(streaming.toolCalls).toEqual([])
      expect(streaming.images).toEqual([])
    })

    it('has sidebarOpen true', () => {
      expect(useStore.getState().sidebarOpen).toBe(true)
    })

    it('has rightPanelOpen false', () => {
      expect(useStore.getState().rightPanelOpen).toBe(false)
    })

    it('has empty activeKnowledgeBaseIds', () => {
      expect(useStore.getState().activeKnowledgeBaseIds).toEqual([])
    })
  })

  describe('setUser', () => {
    it('sets the user', () => {
      const user = { id: '1', email: 'test@example.com', name: 'Test' }
      useStore.getState().setUser(user as any)
      expect(useStore.getState().user).toEqual(user)
    })

    it('clears the user with null', () => {
      useStore.getState().setUser({ id: '1', email: 'test@example.com' } as any)
      useStore.getState().setUser(null)
      expect(useStore.getState().user).toBeNull()
    })
  })

  describe('setConversations', () => {
    it('sets conversations list', () => {
      const convs = [
        { id: '1', title: 'Chat 1', createdAt: '', updatedAt: '' },
        { id: '2', title: 'Chat 2', createdAt: '', updatedAt: '' },
      ] as Conversation[]
      useStore.getState().setConversations(convs)
      expect(useStore.getState().conversations).toHaveLength(2)
      expect(useStore.getState().conversations[0].title).toBe('Chat 1')
    })
  })

  describe('setActiveConversationId', () => {
    it('sets the active conversation id', () => {
      useStore.getState().setActiveConversationId('conv-1')
      expect(useStore.getState().activeConversationId).toBe('conv-1')
    })

    it('persists to localStorage', () => {
      useStore.getState().setActiveConversationId('conv-1')
      expect(localStorageMock.setItem).toHaveBeenCalledWith('nexus:activeConversationId', 'conv-1')
    })

    it('removes from localStorage when set to null', () => {
      useStore.getState().setActiveConversationId(null)
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('nexus:activeConversationId')
    })

    it('resets sandbox state when switching conversations', () => {
      useStore.getState().setSandboxId('sb-1')
      useStore.getState().setSandboxStatus('running')
      useStore.getState().setActiveConversationId('conv-2')
      expect(useStore.getState().sandboxStatus).toBe('none')
      expect(useStore.getState().sandboxId).toBeNull()
    })
  })

  describe('streaming state', () => {
    it('setStreaming merges partial state', () => {
      useStore.getState().setStreaming({ content: 'Hello' })
      expect(useStore.getState().streaming.content).toBe('Hello')
      expect(useStore.getState().streaming.reasoning).toBe('')
    })

    it('appendStreamingContent appends text', () => {
      useStore.getState().setStreaming({ content: 'Hello' })
      useStore.getState().appendStreamingContent(' World')
      expect(useStore.getState().streaming.content).toBe('Hello World')
    })

    it('resetStreaming clears streaming state', () => {
      useStore.getState().setStreaming({ content: 'Hello', reasoning: 'thinking' })
      useStore.getState().resetStreaming()
      expect(useStore.getState().streaming.content).toBe('')
      expect(useStore.getState().streaming.reasoning).toBe('')
    })

    it('setIsStreaming updates streaming flag', () => {
      useStore.getState().setIsStreaming(true)
      expect(useStore.getState().isStreaming).toBe(true)
      useStore.getState().setIsStreaming(false)
      expect(useStore.getState().isStreaming).toBe(false)
    })
  })

  describe('togglePinConversation', () => {
    it('pins an unpinned conversation', () => {
      const convs = [
        { id: '1', title: 'Chat 1', createdAt: '', updatedAt: '', pinned: false },
      ] as Conversation[]
      useStore.getState().setConversations(convs)
      useStore.getState().togglePinConversation('1')
      expect(useStore.getState().conversations[0].pinned).toBe(true)
    })

    it('unpins a pinned conversation', () => {
      const convs = [
        { id: '1', title: 'Chat 1', createdAt: '', updatedAt: '', pinned: true },
      ] as Conversation[]
      useStore.getState().setConversations(convs)
      useStore.getState().togglePinConversation('1')
      expect(useStore.getState().conversations[0].pinned).toBe(false)
    })

    it('persists pinned IDs to localStorage', () => {
      const convs = [
        { id: '1', title: 'Chat 1', createdAt: '', updatedAt: '', pinned: false },
        { id: '2', title: 'Chat 2', createdAt: '', updatedAt: '', pinned: true },
      ] as Conversation[]
      useStore.getState().setConversations(convs)
      useStore.getState().togglePinConversation('1')
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'nexus:pinnedConversations',
        JSON.stringify(['1', '2'])
      )
    })
  })

  describe('toggleKnowledgeBase', () => {
    it('adds a knowledge base id', () => {
      useStore.getState().toggleKnowledgeBase('kb-1')
      expect(useStore.getState().activeKnowledgeBaseIds).toEqual(['kb-1'])
    })

    it('removes an existing knowledge base id', () => {
      useStore.getState().setActiveKnowledgeBaseIds(['kb-1', 'kb-2'])
      useStore.getState().toggleKnowledgeBase('kb-1')
      expect(useStore.getState().activeKnowledgeBaseIds).toEqual(['kb-2'])
    })
  })

  describe('abort controller management', () => {
    it('sets abort controller', () => {
      const controller = new AbortController()
      useStore.getState().setAbortController(controller)
      expect(useStore.getState().abortController).toBe(controller)
    })

    it('abortStreaming aborts and clears controller', () => {
      const controller = new AbortController()
      const abortSpy = vi.spyOn(controller, 'abort')
      useStore.getState().setActiveConversationId('conv-1')
      useStore.getState().setAbortController(controller)
      useStore.getState().abortStreaming()
      expect(abortSpy).toHaveBeenCalled()
    })
  })

  describe('reset', () => {
    it('clears all state back to initial values', () => {
      useStore.getState().setUser({ id: '1', email: 'test@example.com' } as any)
      useStore.getState().setConversations([{ id: '1', title: 'Chat', createdAt: '', updatedAt: '' }] as Conversation[])
      useStore.getState().setActiveConversationId('1')
      useStore.getState().setIsStreaming(true)
      useStore.getState().setStreaming({ content: 'Hello' })

      useStore.getState().reset()

      expect(useStore.getState().user).toBeNull()
      expect(useStore.getState().conversations).toEqual([])
      expect(useStore.getState().activeConversationId).toBeNull()
      expect(useStore.getState().isStreaming).toBe(false)
      expect(useStore.getState().streaming.content).toBe('')
    })

    it('removes activeConversationId from localStorage', () => {
      useStore.getState().reset()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('nexus:activeConversationId')
    })
  })

  describe('updateConversationTitle', () => {
    it('updates the title of a conversation', () => {
      useStore.getState().setConversations([
        { id: '1', title: 'Old Title', createdAt: '', updatedAt: '' },
      ] as Conversation[])
      useStore.getState().updateConversationTitle('1', 'New Title')
      expect(useStore.getState().conversations[0].title).toBe('New Title')
    })

    it('does not affect other conversations', () => {
      useStore.getState().setConversations([
        { id: '1', title: 'Chat 1', createdAt: '', updatedAt: '' },
        { id: '2', title: 'Chat 2', createdAt: '', updatedAt: '' },
      ] as Conversation[])
      useStore.getState().updateConversationTitle('1', 'Updated')
      expect(useStore.getState().conversations[1].title).toBe('Chat 2')
    })
  })

  describe('setCommandPaletteOpen', () => {
    it('opens the command palette', () => {
      useStore.getState().setCommandPaletteOpen(true)
      expect(useStore.getState().commandPaletteOpen).toBe(true)
    })

    it('closes the command palette', () => {
      useStore.getState().setCommandPaletteOpen(true)
      useStore.getState().setCommandPaletteOpen(false)
      expect(useStore.getState().commandPaletteOpen).toBe(false)
    })
  })
})
