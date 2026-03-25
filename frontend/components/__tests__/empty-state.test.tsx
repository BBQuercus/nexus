import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmptyState from '@/components/empty-state'
import { useStore } from '@/lib/store'
import type { Conversation } from '@/lib/types'

// Mock lucide-react with explicit icon stubs
vi.mock('lucide-react', () => {
  const stub = (props: Record<string, unknown>) => <span {...props} />
  return {
    Zap: stub,
    BarChart3: stub,
    Code2: stub,
    Database: stub,
    Globe: stub,
    Terminal: stub,
    ClipboardList: stub,
    Brain: stub,
    Search: stub,
    GitCompare: stub,
    Image: stub,
    Blocks: stub,
  }
})

// Helper: render and wait for the 50ms loading gate to pass
async function renderReady(ui: React.ReactElement) {
  const result = render(ui)
  // Wait for the setTimeout(50) inside EmptyState to fire
  await act(async () => { await new Promise((r) => setTimeout(r, 60)) })
  return result
}

describe('EmptyState', () => {
  beforeEach(() => {
    useStore.getState().reset()
  })

  describe('when user has no conversations', () => {
    beforeEach(() => {
      useStore.getState().setConversations([])
    })

    it('renders without crashing', async () => {
      await renderReady(<EmptyState />)
      expect(screen.getByText('Nexus')).toBeInTheDocument()
    })

    it('displays the standard empty-state tagline', async () => {
      await renderReady(<EmptyState />)
      expect(screen.getByText(/Agents, tools, and sandboxed execution/)).toBeInTheDocument()
    })

    it('does not display onboarding action cards', async () => {
      await renderReady(<EmptyState />)
      expect(screen.queryByText('Sandbox & Execute')).not.toBeInTheDocument()
      expect(screen.queryByText('Build & Preview')).not.toBeInTheDocument()
      expect(screen.queryByText('Research & Ground')).not.toBeInTheDocument()
      expect(screen.queryByText('Forms & Workflows')).not.toBeInTheDocument()
    })

    it('displays capability buttons', async () => {
      await renderReady(<EmptyState />)
      expect(screen.getByText('Python Sandbox')).toBeInTheDocument()
      expect(screen.getByText('Knowledge Base')).toBeInTheDocument()
      expect(screen.getByText('Charts')).toBeInTheDocument()
      expect(screen.getByText('SQL on Files')).toBeInTheDocument()
      expect(screen.getByText('Interactive Forms')).toBeInTheDocument()
      expect(screen.getByText('Multi-Model Compare')).toBeInTheDocument()
      expect(screen.getByText('AI Memory')).toBeInTheDocument()
    })

    it('does not display quick suggestion chips', async () => {
      await renderReady(<EmptyState />)
      expect(screen.queryByText('Analyze a CSV and create interactive charts')).not.toBeInTheDocument()
      expect(screen.queryByText('Build a React dashboard with live preview')).not.toBeInTheDocument()
    })

    it('sets pending prompt when clicking a capability button', async () => {
      const user = userEvent.setup()
      await renderReady(<EmptyState />)
      await user.click(screen.getByText('Python Sandbox'))
      expect(useStore.getState().pendingPrompt).toContain('Python sandbox workflow')
    })

  })

  describe('when user has existing conversations', () => {
    beforeEach(() => {
      useStore.getState().setConversations([
        { id: '1', title: 'Existing Chat', createdAt: '', updatedAt: '' },
      ] as Conversation[])
    })

    it('renders the returning user screen', async () => {
      await renderReady(<EmptyState />)
      expect(screen.getByText('Nexus')).toBeInTheDocument()
    })

    it('shows starter suggestions', async () => {
      await renderReady(<EmptyState />)
      expect(screen.getByText('Run code in a sandbox, inspect files, and generate artifacts')).toBeInTheDocument()
      expect(screen.getByText('Build a web app with live preview and hot-reload')).toBeInTheDocument()
      expect(screen.getByText('Analyze data with SQL, Python, and interactive charts')).toBeInTheDocument()
      expect(screen.getByText('Research a topic with web search and cited sources')).toBeInTheDocument()
    })

    it('does not show onboarding action cards', async () => {
      await renderReady(<EmptyState />)
      expect(screen.queryByText('Sandbox & Execute')).not.toBeInTheDocument()
    })

    it('sets pending prompt when clicking a starter', async () => {
      const user = userEvent.setup()
      await renderReady(<EmptyState />)
      await user.click(screen.getByText('Run code in a sandbox, inspect files, and generate artifacts'))
      expect(useStore.getState().pendingPrompt).toBe('Run code in a sandbox, inspect files, and generate artifacts')
    })
  })
})
