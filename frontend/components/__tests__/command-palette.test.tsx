import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
    X: stub,
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
    expect(screen.getByText('Actions')).toBeInTheDocument()
    expect(screen.getByText('Models')).toBeInTheDocument()
    expect(screen.getByText('Slash Commands')).toBeInTheDocument()
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
  })

  describe('keyboard navigation', () => {
    it('closes on Escape key', async () => {
      const user = userEvent.setup()
      render(<CommandPalette />)

      const input = screen.getByPlaceholderText(/Type a command or search/)
      await user.type(input, '{Escape}')

      expect(useStore.getState().commandPaletteOpen).toBe(false)
    })

    it('selects items with ArrowDown', async () => {
      const user = userEvent.setup()
      render(<CommandPalette />)

      const input = screen.getByPlaceholderText(/Type a command or search/)
      await user.type(input, '{ArrowDown}')

      // cmdk uses data-selected="true" for the selected item
      const items = document.querySelectorAll('[cmdk-item]')
      // After one ArrowDown, the second item should be selected
      const selected = document.querySelector('[cmdk-item][data-selected="true"]')
      expect(selected).toBeTruthy()
      expect(selected).toBe(items[1])
    })
  })

  describe('closing', () => {
    it('closes when clicking the overlay', async () => {
      const user = userEvent.setup()
      render(<CommandPalette />)

      // Radix Dialog uses a data-state="open" overlay
      const overlay = document.querySelector('[data-state="open"]')
      if (overlay) {
        await user.click(overlay)
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
