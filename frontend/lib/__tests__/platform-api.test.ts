import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock auth module before importing api
vi.mock('@/lib/auth', () => ({
  getCsrfToken: vi.fn(() => 'csrf-test'),
  refreshAccessToken: vi.fn(() => Promise.resolve(null)),
  startTokenRefreshTimer: vi.fn(),
}))

// Mock toast module
vi.mock('@/components/toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}))

function expectPath(callUrl: unknown, expectedPath: string) {
  expect(typeof callUrl).toBe('string')
  expect((callUrl as string).endsWith(expectedPath)).toBe(true)
}

function mockFetchResponse(status: number, body: unknown) {
  const responseHeaders = new Headers({
    'content-type': 'application/json',
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

describe('Platform API — New Features', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  // ── Approval Gates ──

  describe('Approval Gates', () => {
    it('listApprovalGates sends GET to /api/approval-gates', async () => {
      const fetchMock = mockFetchResponse(200, [])
      globalThis.fetch = fetchMock
      const { listApprovalGates } = await import('@/lib/api')
      await listApprovalGates()
      expectPath(fetchMock.mock.calls[0][0], '/api/approval-gates')
    })

    it('listApprovalGates appends query params', async () => {
      const fetchMock = mockFetchResponse(200, [])
      globalThis.fetch = fetchMock
      const { listApprovalGates } = await import('@/lib/api')
      await listApprovalGates({ conversation_id: 'conv-1', status: 'pending' })
      expectPath(fetchMock.mock.calls[0][0], '/api/approval-gates?conversation_id=conv-1&status=pending')
    })

    it('approveGate sends POST to /api/approval-gates/:id/approve', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'g-1', status: 'approved' })
      globalThis.fetch = fetchMock
      const { approveGate } = await import('@/lib/api')
      const result = await approveGate('g-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/approval-gates/g-1/approve')
      expect(fetchMock.mock.calls[0][1].method).toBe('POST')
      expect(result.id).toBe('g-1')
    })

    it('rejectGate sends POST to /api/approval-gates/:id/reject', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'g-1', status: 'rejected' })
      globalThis.fetch = fetchMock
      const { rejectGate } = await import('@/lib/api')
      await rejectGate('g-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/approval-gates/g-1/reject')
      expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    })

    it('editGate sends POST with edited_arguments', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'g-1', status: 'edited' })
      globalThis.fetch = fetchMock
      const { editGate } = await import('@/lib/api')
      await editGate('g-1', { param: 'value' })
      expectPath(fetchMock.mock.calls[0][0], '/api/approval-gates/g-1/edit')
      expect(fetchMock.mock.calls[0][1].method).toBe('POST')
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ edited_arguments: { param: 'value' } }))
    })
  })

  // ── Prompt Templates ──

  describe('Prompt Templates', () => {
    it('listPromptTemplates sends GET to /api/prompt-templates', async () => {
      const fetchMock = mockFetchResponse(200, [])
      globalThis.fetch = fetchMock
      const { listPromptTemplates } = await import('@/lib/api')
      await listPromptTemplates()
      expectPath(fetchMock.mock.calls[0][0], '/api/prompt-templates')
    })

    it('createPromptTemplate sends POST with body', async () => {
      const data = { name: 'Test', template: 'Hello {{name}}', description: 'A test template' }
      const fetchMock = mockFetchResponse(200, { id: 'pt-1', ...data })
      globalThis.fetch = fetchMock
      const { createPromptTemplate } = await import('@/lib/api')
      const result = await createPromptTemplate(data)
      expectPath(fetchMock.mock.calls[0][0], '/api/prompt-templates')
      expect(fetchMock.mock.calls[0][1].method).toBe('POST')
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify(data))
      expect(result.id).toBe('pt-1')
    })

    it('updatePromptTemplate sends PATCH to /api/prompt-templates/:id', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'pt-1', name: 'Updated' })
      globalThis.fetch = fetchMock
      const { updatePromptTemplate } = await import('@/lib/api')
      await updatePromptTemplate('pt-1', { name: 'Updated' })
      expectPath(fetchMock.mock.calls[0][0], '/api/prompt-templates/pt-1')
      expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ name: 'Updated' }))
    })

    it('deletePromptTemplate sends DELETE to /api/prompt-templates/:id', async () => {
      const fetchMock = mockFetchResponse(200, { ok: true })
      globalThis.fetch = fetchMock
      const { deletePromptTemplate } = await import('@/lib/api')
      const result = await deletePromptTemplate('pt-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/prompt-templates/pt-1')
      expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
      expect(result.ok).toBe(true)
    })

    it('renderPromptTemplate sends POST with variables', async () => {
      const fetchMock = mockFetchResponse(200, { rendered: 'Hello World' })
      globalThis.fetch = fetchMock
      const { renderPromptTemplate } = await import('@/lib/api')
      const result = await renderPromptTemplate('pt-1', { name: 'World' })
      expectPath(fetchMock.mock.calls[0][0], '/api/prompt-templates/pt-1/render')
      expect(fetchMock.mock.calls[0][1].method).toBe('POST')
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ variables: { name: 'World' } }))
      expect(result.rendered).toBe('Hello World')
    })
  })

  // ── Agent Runs ──

  describe('Agent Runs', () => {
    it('listAgentRuns sends GET to /api/agent-runs', async () => {
      const fetchMock = mockFetchResponse(200, [])
      globalThis.fetch = fetchMock
      const { listAgentRuns } = await import('@/lib/api')
      await listAgentRuns()
      expectPath(fetchMock.mock.calls[0][0], '/api/agent-runs')
    })

    it('listAgentRuns appends query params', async () => {
      const fetchMock = mockFetchResponse(200, [])
      globalThis.fetch = fetchMock
      const { listAgentRuns } = await import('@/lib/api')
      await listAgentRuns({ agent_persona_id: 'ap-1', status: 'running', limit: 10, offset: 5 })
      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toContain('agent_persona_id=ap-1')
      expect(url).toContain('status=running')
      expect(url).toContain('limit=10')
      expect(url).toContain('offset=5')
    })

    it('getAgentRun sends GET to /api/agent-runs/:id', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'run-1', status: 'completed' })
      globalThis.fetch = fetchMock
      const { getAgentRun } = await import('@/lib/api')
      const result = await getAgentRun('run-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/agent-runs/run-1')
      expect(result.id).toBe('run-1')
    })

    it('rerunAgent sends POST to /api/agent-runs/:id/rerun', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'run-2', trigger: 'rerun' })
      globalThis.fetch = fetchMock
      const { rerunAgent } = await import('@/lib/api')
      await rerunAgent('run-1', { input_text: 'new input' })
      expectPath(fetchMock.mock.calls[0][0], '/api/agent-runs/run-1/rerun')
      expect(fetchMock.mock.calls[0][1].method).toBe('POST')
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ input_text: 'new input' }))
    })

    it('rerunAgent sends empty object when no data provided', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'run-2' })
      globalThis.fetch = fetchMock
      const { rerunAgent } = await import('@/lib/api')
      await rerunAgent('run-1')
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({}))
    })

    it('deleteAgentRun sends DELETE to /api/agent-runs/:id', async () => {
      const fetchMock = mockFetchResponse(200, { ok: true })
      globalThis.fetch = fetchMock
      const { deleteAgentRun } = await import('@/lib/api')
      await deleteAgentRun('run-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/agent-runs/run-1')
      expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
    })
  })

  // ── Agent Schedules ──

  describe('Agent Schedules', () => {
    it('listAgentSchedules sends GET to /api/agent-schedules', async () => {
      const fetchMock = mockFetchResponse(200, [])
      globalThis.fetch = fetchMock
      const { listAgentSchedules } = await import('@/lib/api')
      await listAgentSchedules()
      expectPath(fetchMock.mock.calls[0][0], '/api/agent-schedules')
    })

    it('createAgentSchedule sends POST with body', async () => {
      const data = { agent_persona_id: 'ap-1', name: 'Daily Run', cron_expression: '0 9 * * *' }
      const fetchMock = mockFetchResponse(200, { id: 'sched-1', ...data })
      globalThis.fetch = fetchMock
      const { createAgentSchedule } = await import('@/lib/api')
      const result = await createAgentSchedule(data)
      expectPath(fetchMock.mock.calls[0][0], '/api/agent-schedules')
      expect(fetchMock.mock.calls[0][1].method).toBe('POST')
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify(data))
      expect(result.id).toBe('sched-1')
    })

    it('updateAgentSchedule sends PATCH to /api/agent-schedules/:id', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'sched-1', enabled: false })
      globalThis.fetch = fetchMock
      const { updateAgentSchedule } = await import('@/lib/api')
      await updateAgentSchedule('sched-1', { enabled: false })
      expectPath(fetchMock.mock.calls[0][0], '/api/agent-schedules/sched-1')
      expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ enabled: false }))
    })

    it('deleteAgentSchedule sends DELETE to /api/agent-schedules/:id', async () => {
      const fetchMock = mockFetchResponse(200, { ok: true })
      globalThis.fetch = fetchMock
      const { deleteAgentSchedule } = await import('@/lib/api')
      await deleteAgentSchedule('sched-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/agent-schedules/sched-1')
      expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
    })

    it('triggerAgentSchedule sends POST to /api/agent-schedules/:id/trigger', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'run-1', trigger: 'schedule' })
      globalThis.fetch = fetchMock
      const { triggerAgentSchedule } = await import('@/lib/api')
      const result = await triggerAgentSchedule('sched-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/agent-schedules/sched-1/trigger')
      expect(fetchMock.mock.calls[0][1].method).toBe('POST')
      expect(result.id).toBe('run-1')
    })
  })



  // ── External Actions ──

  describe('External Actions', () => {
    it('listExternalActions sends GET to /api/external-actions', async () => {
      const fetchMock = mockFetchResponse(200, [])
      globalThis.fetch = fetchMock
      const { listExternalActions } = await import('@/lib/api')
      await listExternalActions()
      expectPath(fetchMock.mock.calls[0][0], '/api/external-actions')
    })

    it('listExternalActions appends query params', async () => {
      const fetchMock = mockFetchResponse(200, [])
      globalThis.fetch = fetchMock
      const { listExternalActions } = await import('@/lib/api')
      await listExternalActions({ action_type: 'email', status: 'pending', agent_run_id: 'run-1' })
      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toContain('action_type=email')
      expect(url).toContain('status=pending')
      expect(url).toContain('agent_run_id=run-1')
    })

    it('getExternalAction sends GET to /api/external-actions/:id', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'ea-1', actionType: 'email' })
      globalThis.fetch = fetchMock
      const { getExternalAction } = await import('@/lib/api')
      const result = await getExternalAction('ea-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/external-actions/ea-1')
      expect(result.id).toBe('ea-1')
    })

    it('createExternalAction sends POST with body', async () => {
      const data = { action_type: 'slack', preview: { channel: '#general', message: 'Hello' } }
      const fetchMock = mockFetchResponse(200, { id: 'ea-1', ...data })
      globalThis.fetch = fetchMock
      const { createExternalAction } = await import('@/lib/api')
      await createExternalAction(data)
      expectPath(fetchMock.mock.calls[0][0], '/api/external-actions')
      expect(fetchMock.mock.calls[0][1].method).toBe('POST')
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify(data))
    })

    it('approveExternalAction sends POST to /api/external-actions/:id/approve', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'ea-1', status: 'approved' })
      globalThis.fetch = fetchMock
      const { approveExternalAction } = await import('@/lib/api')
      await approveExternalAction('ea-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/external-actions/ea-1/approve')
      expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    })

    it('rejectExternalAction sends POST to /api/external-actions/:id/reject', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'ea-1', status: 'rejected' })
      globalThis.fetch = fetchMock
      const { rejectExternalAction } = await import('@/lib/api')
      await rejectExternalAction('ea-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/external-actions/ea-1/reject')
      expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    })
  })

  // ── Test Cases ──

  describe('Test Cases', () => {
    it('listTestCases sends GET with agent_persona_id query', async () => {
      const fetchMock = mockFetchResponse(200, [])
      globalThis.fetch = fetchMock
      const { listTestCases } = await import('@/lib/api')
      await listTestCases('ap-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/test-cases?agent_persona_id=ap-1')
    })

    it('createTestCase sends POST with body', async () => {
      const data = { agent_persona_id: 'ap-1', name: 'Basic test', input_text: 'Hello' }
      const fetchMock = mockFetchResponse(200, { id: 'tc-1', ...data })
      globalThis.fetch = fetchMock
      const { createTestCase } = await import('@/lib/api')
      const result = await createTestCase(data)
      expectPath(fetchMock.mock.calls[0][0], '/api/test-cases')
      expect(fetchMock.mock.calls[0][1].method).toBe('POST')
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify(data))
      expect(result.id).toBe('tc-1')
    })

    it('updateTestCase sends PATCH to /api/test-cases/:id', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'tc-1', name: 'Updated' })
      globalThis.fetch = fetchMock
      const { updateTestCase } = await import('@/lib/api')
      await updateTestCase('tc-1', { name: 'Updated', expected_output: 'Hi there' })
      expectPath(fetchMock.mock.calls[0][0], '/api/test-cases/tc-1')
      expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
    })

    it('deleteTestCase sends DELETE to /api/test-cases/:id', async () => {
      const fetchMock = mockFetchResponse(200, { ok: true })
      globalThis.fetch = fetchMock
      const { deleteTestCase } = await import('@/lib/api')
      await deleteTestCase('tc-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/test-cases/tc-1')
      expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
    })

    it('runTestSuite sends POST to /api/test-cases/run', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'tr-1', status: 'running', totalCases: 3, passed: 0, failed: 0 })
      globalThis.fetch = fetchMock
      const { runTestSuite } = await import('@/lib/api')
      const result = await runTestSuite('ap-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/test-cases/run')
      expect(fetchMock.mock.calls[0][1].method).toBe('POST')
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ agent_persona_id: 'ap-1' }))
      expect(result.id).toBe('tr-1')
    })

    it('listTestRuns sends GET with agent_persona_id query', async () => {
      const fetchMock = mockFetchResponse(200, [])
      globalThis.fetch = fetchMock
      const { listTestRuns } = await import('@/lib/api')
      await listTestRuns('ap-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/test-cases/runs?agent_persona_id=ap-1')
    })

    it('getTestRun sends GET to /api/test-cases/runs/:id', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'tr-1', status: 'completed' })
      globalThis.fetch = fetchMock
      const { getTestRun } = await import('@/lib/api')
      const result = await getTestRun('tr-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/test-cases/runs/tr-1')
      expect(result.id).toBe('tr-1')
    })
  })

  // ── Marketplace ──

  describe('Marketplace', () => {
    it('browseMarketplace sends GET to /api/marketplace', async () => {
      const fetchMock = mockFetchResponse(200, [])
      globalThis.fetch = fetchMock
      const { browseMarketplace } = await import('@/lib/api')
      await browseMarketplace()
      expectPath(fetchMock.mock.calls[0][0], '/api/marketplace')
    })

    it('browseMarketplace appends all query params', async () => {
      const fetchMock = mockFetchResponse(200, [])
      globalThis.fetch = fetchMock
      const { browseMarketplace } = await import('@/lib/api')
      await browseMarketplace({ category: 'productivity', search: 'summarize', sort_by: 'popular', limit: 10, offset: 20 })
      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toContain('category=productivity')
      expect(url).toContain('search=summarize')
      expect(url).toContain('sort_by=popular')
      expect(url).toContain('limit=10')
      expect(url).toContain('offset=20')
    })

    it('getFeaturedListings sends GET to /api/marketplace/featured', async () => {
      const fetchMock = mockFetchResponse(200, [])
      globalThis.fetch = fetchMock
      const { getFeaturedListings } = await import('@/lib/api')
      await getFeaturedListings()
      expectPath(fetchMock.mock.calls[0][0], '/api/marketplace/featured')
    })

    it('getMarketplaceListing sends GET to /api/marketplace/:id', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'ml-1', agentPersonaId: 'ap-1' })
      globalThis.fetch = fetchMock
      const { getMarketplaceListing } = await import('@/lib/api')
      const result = await getMarketplaceListing('ml-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/marketplace/ml-1')
      expect(result.id).toBe('ml-1')
    })

    it('publishToMarketplace sends POST with body', async () => {
      const data = { agent_persona_id: 'ap-1', visibility: 'public', category: 'productivity', tags: ['ai', 'summary'] }
      const fetchMock = mockFetchResponse(200, { id: 'ml-1', ...data })
      globalThis.fetch = fetchMock
      const { publishToMarketplace } = await import('@/lib/api')
      const result = await publishToMarketplace(data)
      expectPath(fetchMock.mock.calls[0][0], '/api/marketplace')
      expect(fetchMock.mock.calls[0][1].method).toBe('POST')
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify(data))
      expect(result.id).toBe('ml-1')
    })

    it('installFromMarketplace sends POST to /api/marketplace/:id/install', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'agent-installed', name: 'Summarizer' })
      globalThis.fetch = fetchMock
      const { installFromMarketplace } = await import('@/lib/api')
      const result = await installFromMarketplace('ml-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/marketplace/ml-1/install')
      expect(fetchMock.mock.calls[0][1].method).toBe('POST')
      expect(result.id).toBe('agent-installed')
    })

    it('rateMarketplaceListing sends POST with rating data', async () => {
      const fetchMock = mockFetchResponse(200, { id: 'rating-1', rating: 5, review: 'Great!' })
      globalThis.fetch = fetchMock
      const { rateMarketplaceListing } = await import('@/lib/api')
      const result = await rateMarketplaceListing('ml-1', { rating: 5, review: 'Great!' })
      expectPath(fetchMock.mock.calls[0][0], '/api/marketplace/ml-1/rate')
      expect(fetchMock.mock.calls[0][1].method).toBe('POST')
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ rating: 5, review: 'Great!' }))
      expect(result.rating).toBe(5)
    })

    it('getListingRatings sends GET to /api/marketplace/:id/ratings', async () => {
      const fetchMock = mockFetchResponse(200, [])
      globalThis.fetch = fetchMock
      const { getListingRatings } = await import('@/lib/api')
      await getListingRatings('ml-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/marketplace/ml-1/ratings')
    })

    it('deleteMarketplaceListing sends DELETE to /api/marketplace/:id', async () => {
      const fetchMock = mockFetchResponse(200, { ok: true })
      globalThis.fetch = fetchMock
      const { deleteMarketplaceListing } = await import('@/lib/api')
      await deleteMarketplaceListing('ml-1')
      expectPath(fetchMock.mock.calls[0][0], '/api/marketplace/ml-1')
      expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
    })
  })
})
