import { describe, it, expect } from 'vitest'
import type {
  ApprovalGate,
  PromptTemplate,
  TemplateVariable,
  AgentRunRecord,
  AgentRunStep,
  AgentSchedule,
  ExternalAction,
  TestCase,
  TestRun,
  TestCaseResult,
  MarketplaceListing,
  AgentRatingRecord,
} from '../types'

// Helper: if this file compiles, all types are structurally valid.
// Each test also verifies the object has the expected required keys at runtime.

describe('Platform Types — Compile-time & Runtime Integrity', () => {
  describe('ApprovalGate', () => {
    it('satisfies the ApprovalGate interface with all required fields', () => {
      const gate: ApprovalGate = {
        id: 'gate-1',
        agentRunId: 'run-1',
        conversationId: 'conv-1',
        toolName: 'web_search',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00Z',
      }
      expect(gate.id).toBe('gate-1')
      expect(gate.agentRunId).toBe('run-1')
      expect(gate.conversationId).toBe('conv-1')
      expect(gate.toolName).toBe('web_search')
      expect(gate.status).toBe('pending')
      expect(gate.createdAt).toBeDefined()
    })

    it('supports optional fields', () => {
      const gate: ApprovalGate = {
        id: 'gate-2',
        agentRunId: 'run-1',
        conversationId: 'conv-1',
        toolName: 'code_exec',
        status: 'edited',
        decidedBy: 'user-1',
        decidedAt: '2026-01-02T00:00:00Z',
        editedArguments: { code: 'print("hi")' },
        toolArguments: { language: 'python' },
        createdAt: '2026-01-01T00:00:00Z',
      }
      expect(gate.decidedBy).toBe('user-1')
      expect(gate.editedArguments).toEqual({ code: 'print("hi")' })
      expect(gate.toolArguments).toEqual({ language: 'python' })
    })
  })

  describe('PromptTemplate', () => {
    it('satisfies the PromptTemplate interface', () => {
      const tmpl: PromptTemplate = {
        id: 'pt-1',
        userId: 'user-1',
        name: 'Summarizer',
        template: 'Summarize: {{text}}',
        isPublic: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }
      expect(tmpl.id).toBe('pt-1')
      expect(tmpl.name).toBe('Summarizer')
      expect(tmpl.template).toContain('{{text}}')
      expect(tmpl.isPublic).toBe(false)
    })

    it('supports optional fields including variables', () => {
      const variable: TemplateVariable = {
        name: 'language',
        type: 'select',
        options: ['en', 'de'],
        required: true,
        description: 'Target language',
      }
      const tmpl: PromptTemplate = {
        id: 'pt-2',
        userId: 'user-1',
        agentPersonaId: 'ap-1',
        name: 'Translator',
        description: 'Translates text',
        template: 'Translate to {{language}}: {{text}}',
        variables: [variable],
        isPublic: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }
      expect(tmpl.variables).toHaveLength(1)
      expect(tmpl.variables![0].type).toBe('select')
      expect(tmpl.agentPersonaId).toBe('ap-1')
    })
  })

  describe('AgentRunRecord', () => {
    it('satisfies the AgentRunRecord interface with required fields', () => {
      const run: AgentRunRecord = {
        id: 'run-1',
        userId: 'user-1',
        status: 'completed',
        inputText: 'Summarize this document',
        totalInputTokens: 1500,
        totalOutputTokens: 500,
        trigger: 'manual',
        createdAt: '2026-01-01T00:00:00Z',
      }
      expect(run.id).toBe('run-1')
      expect(run.status).toBe('completed')
      expect(run.trigger).toBe('manual')
      expect(run.totalInputTokens).toBe(1500)
    })

    it('supports all optional fields and nested steps', () => {
      const step: AgentRunStep = {
        id: 'step-1',
        agentRunId: 'run-1',
        stepIndex: 0,
        stepType: 'llm_call',
        inputData: { prompt: 'test' },
        outputData: { response: 'ok' },
        durationMs: 120,
        tokensUsed: 500,
        status: 'completed',
        createdAt: '2026-01-01T00:00:00Z',
      }
      const run: AgentRunRecord = {
        id: 'run-1',
        userId: 'user-1',
        agentPersonaId: 'ap-1',
        conversationId: 'conv-1',
        templateId: 'tmpl-1',
        status: 'running',
        inputText: 'Hello',
        inputVariables: { key: 'value' },
        outputText: 'World',
        model: 'gpt-4',
        toolCalls: [{ name: 'search', args: {} }],
        totalInputTokens: 100,
        totalOutputTokens: 50,
        costUsd: 0.01,
        durationMs: 500,
        error: undefined,
        trigger: 'schedule',
        parentRunId: 'run-0',
        createdAt: '2026-01-01T00:00:00Z',
        completedAt: '2026-01-01T00:01:00Z',
        steps: [step],
      }
      expect(run.steps).toHaveLength(1)
      expect(run.steps![0].stepType).toBe('llm_call')
      expect(run.costUsd).toBe(0.01)
    })
  })

  describe('AgentRunStep', () => {
    it('satisfies the AgentRunStep interface', () => {
      const step: AgentRunStep = {
        id: 'step-1',
        agentRunId: 'run-1',
        stepIndex: 0,
        stepType: 'tool_call',
        toolName: 'web_search',
        status: 'completed',
        createdAt: '2026-01-01T00:00:00Z',
      }
      expect(step.stepType).toBe('tool_call')
      expect(step.toolName).toBe('web_search')
    })

    it('supports approval_wait step type', () => {
      const step: AgentRunStep = {
        id: 'step-2',
        agentRunId: 'run-1',
        stepIndex: 1,
        stepType: 'approval_wait',
        status: 'skipped',
        error: 'Gate rejected',
        createdAt: '2026-01-01T00:00:00Z',
      }
      expect(step.stepType).toBe('approval_wait')
      expect(step.status).toBe('skipped')
      expect(step.error).toBe('Gate rejected')
    })
  })

  describe('AgentSchedule', () => {
    it('satisfies the AgentSchedule interface', () => {
      const schedule: AgentSchedule = {
        id: 'sched-1',
        userId: 'user-1',
        agentPersonaId: 'ap-1',
        name: 'Daily Report',
        cronExpression: '0 9 * * *',
        enabled: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }
      expect(schedule.id).toBe('sched-1')
      expect(schedule.cronExpression).toBe('0 9 * * *')
      expect(schedule.enabled).toBe(true)
    })

    it('supports optional fields', () => {
      const schedule: AgentSchedule = {
        id: 'sched-2',
        userId: 'user-1',
        agentPersonaId: 'ap-1',
        templateId: 'tmpl-1',
        name: 'Weekly Summary',
        cronExpression: '0 0 * * 1',
        inputText: 'Summarize this week',
        inputVariables: { scope: 'team' },
        enabled: false,
        lastRunAt: '2026-01-06T00:00:00Z',
        nextRunAt: '2026-01-13T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-07T00:00:00Z',
      }
      expect(schedule.templateId).toBe('tmpl-1')
      expect(schedule.lastRunAt).toBeDefined()
      expect(schedule.nextRunAt).toBeDefined()
    })
  })



  describe('ExternalAction', () => {
    it('satisfies the ExternalAction interface', () => {
      const action: ExternalAction = {
        id: 'ea-1',
        userId: 'user-1',
        actionType: 'email',
        status: 'pending',
        preview: { to: 'alice@example.com', subject: 'Hello', body: 'Hi there' },
        createdAt: '2026-01-01T00:00:00Z',
      }
      expect(action.id).toBe('ea-1')
      expect(action.actionType).toBe('email')
      expect(action.status).toBe('pending')
      expect(action.preview.to).toBe('alice@example.com')
    })

    it('supports all action types and optional fields', () => {
      const action: ExternalAction = {
        id: 'ea-2',
        userId: 'user-1',
        agentRunId: 'run-1',
        actionType: 'slack',
        status: 'sent',
        preview: { channel: '#general', message: 'Hello world' },
        result: { message_ts: '12345.67890' },
        approvedBy: 'user-2',
        approvedAt: '2026-01-01T00:05:00Z',
        sentAt: '2026-01-01T00:05:01Z',
        createdAt: '2026-01-01T00:00:00Z',
      }
      expect(action.agentRunId).toBe('run-1')
      expect(action.result).toBeDefined()
      expect(action.sentAt).toBeDefined()
    })
  })

  describe('TestCase', () => {
    it('satisfies the TestCase interface', () => {
      const tc: TestCase = {
        id: 'tc-1',
        agentPersonaId: 'ap-1',
        name: 'Basic greeting',
        inputText: 'Hello',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }
      expect(tc.id).toBe('tc-1')
      expect(tc.name).toBe('Basic greeting')
      expect(tc.inputText).toBe('Hello')
    })

    it('supports optional fields', () => {
      const tc: TestCase = {
        id: 'tc-2',
        agentPersonaId: 'ap-1',
        name: 'Tool usage test',
        inputText: 'Search for cats',
        inputVariables: { topic: 'cats' },
        expectedOutput: 'Here are results about cats',
        expectedToolCalls: [{ name: 'web_search', args: { query: 'cats' } }],
        evaluationCriteria: 'Must use web_search tool and mention cats',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }
      expect(tc.expectedToolCalls).toHaveLength(1)
      expect(tc.evaluationCriteria).toContain('web_search')
    })
  })

  describe('TestRun', () => {
    it('satisfies the TestRun interface', () => {
      const run: TestRun = {
        id: 'tr-1',
        agentPersonaId: 'ap-1',
        triggeredBy: 'user-1',
        status: 'completed',
        totalCases: 5,
        passed: 4,
        failed: 1,
        createdAt: '2026-01-01T00:00:00Z',
      }
      expect(run.totalCases).toBe(5)
      expect(run.passed).toBe(4)
      expect(run.failed).toBe(1)
    })

    it('supports optional results and timing', () => {
      const result: TestCaseResult = {
        testCaseId: 'tc-1',
        passed: true,
        actualOutput: 'Hello there!',
        score: 0.95,
      }
      const run: TestRun = {
        id: 'tr-2',
        agentPersonaId: 'ap-1',
        triggeredBy: 'user-1',
        status: 'completed',
        totalCases: 1,
        passed: 1,
        failed: 0,
        results: [result],
        durationMs: 3200,
        createdAt: '2026-01-01T00:00:00Z',
        completedAt: '2026-01-01T00:00:03Z',
      }
      expect(run.results).toHaveLength(1)
      expect(run.results![0].score).toBe(0.95)
      expect(run.durationMs).toBe(3200)
    })
  })

  describe('TestCaseResult', () => {
    it('satisfies the TestCaseResult interface with required fields only', () => {
      const result: TestCaseResult = {
        testCaseId: 'tc-1',
        passed: false,
      }
      expect(result.testCaseId).toBe('tc-1')
      expect(result.passed).toBe(false)
    })

    it('supports error field for failed cases', () => {
      const result: TestCaseResult = {
        testCaseId: 'tc-1',
        passed: false,
        actualOutput: 'Unexpected output',
        score: 0.2,
        error: 'Expected tool call not found',
      }
      expect(result.error).toBe('Expected tool call not found')
    })
  })

  describe('MarketplaceListing', () => {
    it('satisfies the MarketplaceListing interface', () => {
      const listing: MarketplaceListing = {
        id: 'ml-1',
        listingType: 'agent',
        agentPersonaId: 'ap-1',
        publisherId: 'user-1',
        visibility: 'public',
        status: 'published',
        version: '1.0.0',
        installCount: 100,
        ratingCount: 25,
        featured: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-15T00:00:00Z',
      }
      expect(listing.id).toBe('ml-1')
      expect(listing.visibility).toBe('public')
      expect(listing.installCount).toBe(100)
      expect(listing.ratingCount).toBe(25)
    })

    it('supports optional fields', () => {
      const listing: MarketplaceListing = {
        id: 'ml-2',
        listingType: 'agent',
        agentPersonaId: 'ap-2',
        publisherId: 'user-1',
        visibility: 'org',
        status: 'approved',
        category: 'productivity',
        tags: ['summarization', 'ai'],
        version: '2.1.0',
        installCount: 500,
        avgRating: 4.5,
        ratingCount: 80,
        featured: true,
        publishedAt: '2026-01-10T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-20T00:00:00Z',
        agent: {
          id: 'ap-2',
          name: 'Super Summarizer',
          icon: 'Sparkles',
          description: 'AI-powered summarization',
          systemPrompt: 'You summarize.',
          isPublic: true,
        },
      }
      expect(listing.category).toBe('productivity')
      expect(listing.tags).toEqual(['summarization', 'ai'])
      expect(listing.avgRating).toBe(4.5)
      expect(listing.featured).toBe(true)
      expect(listing.agent?.name).toBe('Super Summarizer')
    })
  })

  describe('AgentRatingRecord', () => {
    it('satisfies the AgentRatingRecord interface', () => {
      const rating: AgentRatingRecord = {
        id: 'rat-1',
        marketplaceListingId: 'ml-1',
        userId: 'user-1',
        rating: 5,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }
      expect(rating.id).toBe('rat-1')
      expect(rating.rating).toBe(5)
      expect(rating.marketplaceListingId).toBe('ml-1')
    })

    it('supports optional review', () => {
      const rating: AgentRatingRecord = {
        id: 'rat-2',
        marketplaceListingId: 'ml-1',
        userId: 'user-2',
        rating: 3,
        review: 'Works well but could be faster',
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      }
      expect(rating.review).toBe('Works well but could be faster')
    })
  })
})
