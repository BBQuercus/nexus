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
      expect(screen.getByText(/Your AI workspace with sandboxed code execution/)).toBeInTheDocument()
    })

    it('displays action cards', () => {
      render(<EmptyState />)
      expect(screen.getByText('Analyze Data')).toBeInTheDocument()
      expect(screen.getByText('Write Code')).toBeInTheDocument()
      expect(screen.getByText('Ask Anything')).toBeInTheDocument()
    })

    it('displays template buttons', () => {
      render(<EmptyState />)
      expect(screen.getByText('Python')).toBeInTheDocument()
      expect(screen.getByText('Node.js')).toBeInTheDocument()
      expect(screen.getByText('Data Analysis')).toBeInTheDocument()
      expect(screen.getByText('Web App')).toBeInTheDocument()
    })

    it('displays quick suggestion chips', () => {
      render(<EmptyState />)
      expect(screen.getByText('Explain how async/await works')).toBeInTheDocument()
      expect(screen.getByText('Write a REST API with FastAPI')).toBeInTheDocument()
    })

    it('sets pending prompt when clicking an action card', async () => {
      const user = userEvent.setup()
      render(<EmptyState />)

      await user.click(screen.getByText('Analyze Data'))

      expect(useStore.getState().pendingPrompt).toContain('CSV dataset')
    })

    it('sets pending prompt when clicking a template button', async () => {
      const user = userEvent.setup()
      render(<EmptyState />)

      await user.click(screen.getByText('Python'))

      expect(useStore.getState().pendingPrompt).toContain('Python project')
    })

    it('sets pending prompt when clicking a quick suggestion', async () => {
      const user = userEvent.setup()
      render(<EmptyState />)

      await user.click(screen.getByText('Explain how async/await works'))

      expect(useStore.getState().pendingPrompt).toBe('Explain how async/await works')
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
      expect(screen.getByText('Analyze a dataset and create visualizations')).toBeInTheDocument()
      expect(screen.getByText('Build a REST API with FastAPI')).toBeInTheDocument()
      expect(screen.getByText('Debug code and explain the issue')).toBeInTheDocument()
    })

    it('does not show the welcome action cards', () => {
      render(<EmptyState />)
      expect(screen.queryByText('Upload datasets, create visualizations, and extract insights')).not.toBeInTheDocument()
    })

    it('sets pending prompt when clicking a starter', async () => {
      const user = userEvent.setup()
      render(<EmptyState />)

      await user.click(screen.getByText('Analyze a dataset and create visualizations'))

      expect(useStore.getState().pendingPrompt).toBe('Analyze a dataset and create visualizations')
    })
  })
})
