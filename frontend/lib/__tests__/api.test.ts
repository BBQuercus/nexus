import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock auth module before importing api
vi.mock('@/lib/auth', () => ({
  getToken: vi.fn(() => 'test-token'),
  clearToken: vi.fn(),
  getCsrfToken: vi.fn(() => null),
}))

// Mock toast module
vi.mock('@/components/toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}))

import * as auth from '@/lib/auth'

// Helper to set up fetch mock responses
function mockFetchResponse(status: number, body: unknown, headers?: Record<string, string>) {
  const responseHeaders = new Headers({
    'content-type': 'application/json',
    ...headers,
  })
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: responseHeaders,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  })
}

describe('API module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('apiFetch', () => {
    it('adds Authorization header when token exists', async () => {
      const fetchMock = mockFetchResponse(200, { id: '1', title: 'Test' })
      globalThis.fetch = fetchMock

      // Re-import to get fresh module with mocked deps
      const { createConversation } = await import('@/lib/api')
      await createConversation({ title: 'Test' })

      expect(fetchMock).toHaveBeenCalled()
      const callArgs = fetchMock.mock.calls[0]
      expect(callArgs[1].headers['Authorization']).toBe('Bearer test-token')
    })

    it('adds Content-Type header for JSON body', async () => {
      const fetchMock = mockFetchResponse(200, { id: '1', title: 'Test' })
      globalThis.fetch = fetchMock

      const { createConversation } = await import('@/lib/api')
      await createConversation({ title: 'Test' })

      const callArgs = fetchMock.mock.calls[0]
      expect(callArgs[1].headers['Content-Type']).toBe('application/json')
    })

    it('includes credentials in requests', async () => {
      const fetchMock = mockFetchResponse(200, [])
      globalThis.fetch = fetchMock

      const { listAgents } = await import('@/lib/api')
      await listAgents()

      const callArgs = fetchMock.mock.calls[0]
      expect(callArgs[1].credentials).toBe('include')
    })
  })

  describe('error handling', () => {
    it('throws ApiError on non-ok responses', async () => {
      globalThis.fetch = mockFetchResponse(500, { detail: 'Internal error' })

      const { listAgents } = await import('@/lib/api')
      await expect(listAgents()).rejects.toThrow('Internal error')
    })

    it('clears token on 401 response', async () => {
      globalThis.fetch = mockFetchResponse(401, { detail: 'Unauthorized' })

      const { listAgents } = await import('@/lib/api')
      try {
        await listAgents()
      } catch {
        // expected
      }

      expect(auth.clearToken).toHaveBeenCalled()
    })

    it('includes status code in ApiError', async () => {
      globalThis.fetch = mockFetchResponse(429, { detail: 'Rate limited' })

      const { listAgents } = await import('@/lib/api')
      try {
        await listAgents()
        expect.fail('Should have thrown')
      } catch (err: unknown) {
        expect((err as any).name).toBe('ApiError')
        expect((err as any).status).toBe(429)
        expect((err as any).message).toBe('Rate limited')
      }
    })

    it('includes request ID when available', async () => {
      globalThis.fetch = mockFetchResponse(500, { detail: 'Server Error' }, {
        'X-Request-Id': 'req-123',
      })

      const { listAgents } = await import('@/lib/api')
      try {
        await listAgents()
        expect.fail('Should have thrown')
      } catch (err: unknown) {
        expect((err as any).requestId).toBe('req-123')
      }
    })
  })

  describe('conversation CRUD', () => {
    it('createConversation sends POST to /api/conversations', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'conv-1', title: 'New Chat' })
      globalThis.fetch = fetchMock

      const { createConversation } = await import('@/lib/api')
      const result = await createConversation({ title: 'New Chat', model: 'gpt-4' })

      expect(fetchMock).toHaveBeenCalledWith('/api/conversations', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'New Chat', model: 'gpt-4' }),
      }))
      expect(result).toEqual({ id: 'conv-1', title: 'New Chat' })
    })

    it('listConversations sends GET to /api/conversations', async () => {
      const fetchMock = mockFetchResponse(200, {
        conversations: [
          { id: '1', title: 'Chat 1', created_at: '2024-01-01', updated_at: '2024-01-01' },
        ],
        total: 1,
        page: 1,
        page_size: 20,
      })
      globalThis.fetch = fetchMock

      const { listConversations } = await import('@/lib/api')
      const result = await listConversations()

      expect(fetchMock).toHaveBeenCalledWith('/api/conversations', expect.anything())
      expect(result.conversations).toHaveLength(1)
      expect(result.conversations[0].id).toBe('1')
      expect(result.total).toBe(1)
    })

    it('listConversations includes search parameter', async () => {
      const fetchMock = mockFetchResponse(200, {
        conversations: [],
        total: 0,
        page: 1,
        page_size: 20,
      })
      globalThis.fetch = fetchMock

      const { listConversations } = await import('@/lib/api')
      await listConversations('hello')

      expect(fetchMock.mock.calls[0][0]).toBe('/api/conversations?search=hello')
    })

    it('deleteConversation sends DELETE', async () => {
      const fetchMock = mockFetchResponse(204, undefined)
      globalThis.fetch = fetchMock

      const { deleteConversation } = await import('@/lib/api')
      await deleteConversation('conv-1')

      expect(fetchMock).toHaveBeenCalledWith('/api/conversations/conv-1', expect.objectContaining({
        method: 'DELETE',
      }))
    })

    it('updateConversation sends PATCH with body', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'conv-1', title: 'Updated' })
      globalThis.fetch = fetchMock

      const { updateConversation } = await import('@/lib/api')
      await updateConversation('conv-1', { title: 'Updated' })

      expect(fetchMock).toHaveBeenCalledWith('/api/conversations/conv-1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated' }),
      }))
    })
  })
})
