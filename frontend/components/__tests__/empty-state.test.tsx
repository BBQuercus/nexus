import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    MessageCircle: stub,
    Database: stub,
    Globe: stub,
    Terminal: stub,
    Cpu: stub,
    Sparkles: stub,
    ClipboardList: stub,
    Brain: stub,
    Search: stub,
    GitCompare: stub,
    Image: stub,
    Blocks: stub,
    ArrowRight: stub,
  }
})

describe('EmptyState', () => {
  beforeEach(() => {
    useStore.getState().reset()
  })

  describe('when user has no conversations (first-time user)', () => {
    beforeEach(() => {
      useStore.getState().setConversations([])
    })

    it('renders without crashing', () => {
      render(<EmptyState />)
      expect(screen.getByText('Nexus')).toBeInTheDocument()
    })

    it('displays the welcome tagline', () => {
      render(<EmptyState />)
      expect(screen.getByText(/Your AI workspace/)).toBeInTheDocument()
    })

    it('displays action cards', () => {
      render(<EmptyState />)
      expect(screen.getByText('Sandbox & Execute')).toBeInTheDocument()
      expect(screen.getByText('Build & Preview')).toBeInTheDocument()
      expect(screen.getByText('Research & Ground')).toBeInTheDocument()
      expect(screen.getByText('Forms & Workflows')).toBeInTheDocument()
    })

    it('displays capability buttons', () => {
      render(<EmptyState />)
      expect(screen.getByText('Python Sandbox')).toBeInTheDocument()
      expect(screen.getByText('Knowledge Base')).toBeInTheDocument()
      expect(screen.getByText('Charts')).toBeInTheDocument()
      expect(screen.getByText('SQL on Files')).toBeInTheDocument()
      expect(screen.getByText('Interactive Forms')).toBeInTheDocument()
      expect(screen.getByText('Multi-Model Compare')).toBeInTheDocument()
      expect(screen.getByText('AI Memory')).toBeInTheDocument()
    })

    it('displays quick suggestion chips', () => {
      render(<EmptyState />)
      expect(screen.getByText('Analyze a CSV and create interactive charts')).toBeInTheDocument()
      expect(screen.getByText('Build a React dashboard with live preview')).toBeInTheDocument()
    })

    it('sets pending prompt when clicking an action card', async () => {
      const user = userEvent.setup()
      render(<EmptyState />)

      await user.click(screen.getByText('Sandbox & Execute'))

      expect(useStore.getState().pendingPrompt).toContain('Spin up a sandbox')
    })

    it('sets pending prompt when clicking a capability button', async () => {
      const user = userEvent.setup()
      render(<EmptyState />)

      await user.click(screen.getByText('Python Sandbox'))

      expect(useStore.getState().pendingPrompt).toContain('Python sandbox workflow')
    })

    it('sets pending prompt when clicking a quick suggestion', async () => {
      const user = userEvent.setup()
      render(<EmptyState />)

      await user.click(screen.getByText('Analyze a CSV and create interactive charts'))

      expect(useStore.getState().pendingPrompt).toBe('Analyze a CSV and create interactive charts')
    })
  })

  describe('when user has existing conversations (returning user)', () => {
    beforeEach(() => {
      useStore.getState().setConversations([
        { id: '1', title: 'Existing Chat', createdAt: '', updatedAt: '' },
      ] as Conversation[])
    })

    it('renders the returning user screen', () => {
      render(<EmptyState />)
      expect(screen.getByText('Nexus')).toBeInTheDocument()
    })

    it('shows starter suggestions', () => {
      render(<EmptyState />)
      expect(screen.getByText('Run code in a sandbox, inspect files, and generate artifacts')).toBeInTheDocument()
      expect(screen.getByText('Build a web app with live preview and hot-reload')).toBeInTheDocument()
      expect(screen.getByText('Analyze data with SQL, Python, and interactive charts')).toBeInTheDocument()
      expect(screen.getByText('Research a topic with web search and cited sources')).toBeInTheDocument()
    })

    it('does not show the welcome action cards', () => {
      render(<EmptyState />)
      expect(screen.queryByText('Sandbox & Execute')).not.toBeInTheDocument()
    })

    it('sets pending prompt when clicking a starter', async () => {
      const user = userEvent.setup()
      render(<EmptyState />)

      await user.click(screen.getByText('Run code in a sandbox, inspect files, and generate artifacts'))

      expect(useStore.getState().pendingPrompt).toBe('Run code in a sandbox, inspect files, and generate artifacts')
    })
  })
})
