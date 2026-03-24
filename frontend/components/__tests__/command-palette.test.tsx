import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CommandPalette from '@/components/command-palette'
import { useStore } from '@/lib/store'

// Mock lucide-react with explicit icon stubs
vi.mock('lucide-react', () => {
  const stub = (props: Record<string, unknown>) => <span {...props} />
  return {
    Search: stub,
    Terminal: stub,
    FolderOpen: stub,
    Eye: stub,
    Layers: stub,
    LogOut: stub,
    Users: stub,
    Plus: stub,
    MessageSquare: stub,
    Cpu: stub,
    Trash2: stub,
    HelpCircle: stub,
    Download: stub,
    ClipboardCopy: stub,
    RefreshCw: stub,
    Pin: stub,
    Hash: stub,
    GitCompare: stub,
    ScrollText: stub,
    FileText: stub,
  }
})

// Mock api module
vi.mock('@/lib/api', () => ({
  logout: vi.fn(),
  createConversation: vi.fn(),
  listConversations: vi.fn().mockResolvedValue({ conversations: [] }),
}))

// Mock auth module
vi.mock('@/lib/auth', () => ({
  clearToken: vi.fn(),
  getToken: vi.fn(() => null),
  getCsrfToken: vi.fn(() => null),
}))

// Mock toast
vi.mock('@/components/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

// Mock provider logos
vi.mock('@/components/provider-logos', () => ({
  ProviderLogo: (props: Record<string, unknown>) => <span data-testid="provider-logo" {...props} />,
}))

describe('CommandPalette', () => {
  beforeEach(() => {
    useStore.getState().reset()
    useStore.getState().setCommandPaletteOpen(true)
  })

  it('renders the search input', () => {
    render(<CommandPalette />)
    expect(screen.getByPlaceholderText(/Type a command or search/)).toBeInTheDocument()
  })

  it('focuses the input on mount', () => {
    render(<CommandPalette />)
    const input = screen.getByPlaceholderText(/Type a command or search/)
    expect(input).toHaveFocus()
  })

  it('displays command categories', () => {
    render(<CommandPalette />)
    expect(screen.getByText('Models')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
    expect(screen.getByText('Navigation')).toBeInTheDocument()
  })

  it('displays action items', () => {
    render(<CommandPalette />)
    expect(screen.getByText('New Conversation')).toBeInTheDocument()
    expect(screen.getByText('Toggle Right Panel')).toBeInTheDocument()
    expect(screen.getByText('Log Out')).toBeInTheDocument()
  })

  describe('search filtering', () => {
    it('filters actions by query', async () => {
      const user = userEvent.setup()
      render(<CommandPalette />)

      const input = screen.getByPlaceholderText(/Type a command or search/)
      await user.type(input, 'terminal')

      expect(screen.getByText('Show Terminal')).toBeInTheDocument()
      expect(screen.queryByText('Log Out')).not.toBeInTheDocument()
    })

    it('shows "No results found" for non-matching query', async () => {
      const user = userEvent.setup()
      render(<CommandPalette />)

      const input = screen.getByPlaceholderText(/Type a command or search/)
      await user.type(input, 'xyznonexistent')

      expect(screen.getByText('No results found')).toBeInTheDocument()
    })

    it('filters by category name', async () => {
      const user = userEvent.setup()
      render(<CommandPalette />)

      const input = screen.getByPlaceholderText(/Type a command or search/)
      await user.type(input, 'navigation')

      expect(screen.getByText('Toggle Right Panel')).toBeInTheDocument()
      expect(screen.getByText('Show Terminal')).toBeInTheDocument()
    })
  })

  describe('keyboard navigation', () => {
    it('closes on Escape key', async () => {
      const user = userEvent.setup()
      render(<CommandPalette />)

      const input = screen.getByPlaceholderText(/Type a command or search/)
      await user.type(input, '{Escape}')

      expect(useStore.getState().commandPaletteOpen).toBe(false)
    })

    it('moves highlight down with ArrowDown', async () => {
      const user = userEvent.setup()
      render(<CommandPalette />)

      const input = screen.getByPlaceholderText(/Type a command or search/)
      await user.type(input, '{ArrowDown}')

      // The second item should now be highlighted (index 1)
      const items = screen.getAllByRole('button').filter(
        (btn) => btn.getAttribute('data-index') !== null
      )
      expect(items[1]).toHaveClass('bg-accent/10')
    })

    it('moves highlight up with ArrowUp', async () => {
      const user = userEvent.setup()
      render(<CommandPalette />)

      const input = screen.getByPlaceholderText(/Type a command or search/)
      // Move down twice, then up once
      await user.type(input, '{ArrowDown}{ArrowDown}{ArrowUp}')

      const items = screen.getAllByRole('button').filter(
        (btn) => btn.getAttribute('data-index') !== null
      )
      expect(items[1]).toHaveClass('bg-accent/10')
    })

    it('does not go below zero with ArrowUp', async () => {
      const user = userEvent.setup()
      render(<CommandPalette />)

      const input = screen.getByPlaceholderText(/Type a command or search/)
      await user.type(input, '{ArrowUp}')

      // First item should still be highlighted
      const items = screen.getAllByRole('button').filter(
        (btn) => btn.getAttribute('data-index') !== null
      )
      expect(items[0]).toHaveClass('bg-accent/10')
    })
  })

  describe('closing', () => {
    it('closes when clicking the backdrop', async () => {
      const user = userEvent.setup()
      render(<CommandPalette />)

      const backdrop = document.querySelector('.backdrop-blur-sm')
      if (backdrop) {
        await user.click(backdrop)
      }

      expect(useStore.getState().commandPaletteOpen).toBe(false)
    })
  })

  describe('executing actions', () => {
    it('closes palette after executing an action', async () => {
      const user = userEvent.setup()
      render(<CommandPalette />)

      const input = screen.getByPlaceholderText(/Type a command or search/)
      await user.type(input, 'Toggle Right Panel')
      await user.type(input, '{Enter}')

      expect(useStore.getState().commandPaletteOpen).toBe(false)
    })

    it('toggles right panel via command', async () => {
      const user = userEvent.setup()
      useStore.getState().setRightPanelOpen(false)
      render(<CommandPalette />)

      const input = screen.getByPlaceholderText(/Type a command or search/)
      await user.type(input, 'Toggle Right Panel')
      await user.type(input, '{Enter}')

      expect(useStore.getState().rightPanelOpen).toBe(true)
    })
  })
})
