import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UserDropdown from '@/components/user-dropdown'
import { useStore } from '@/lib/store'

const push = vi.fn()
const pathnameState = { value: '/' }

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathnameState.value,
}))

vi.mock('lucide-react', () => {
  const stub = (props: Record<string, unknown>) => <span {...props} />
  return {
    LogOut: stub,
    User: stub,
    Keyboard: stub,
    Shield: stub,
    Users: stub,
    BookOpen: stub,
  }
})

vi.mock('@/lib/api', () => ({
  logout: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  clearToken: vi.fn(),
}))

describe('UserDropdown', () => {
  beforeEach(() => {
    push.mockReset()
    pathnameState.value = '/'
    useStore.getState().reset()
    useStore.getState().setUser({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      isAdmin: true,
    })
  })

  it('navigates to the selected route from the dropdown', async () => {
    const user = userEvent.setup()
    render(<UserDropdown />)

    await user.click(screen.getByRole('button', { name: /test user/i }))
    await user.click(screen.getByRole('button', { name: /agents/i }))

    expect(push).toHaveBeenCalledWith('/agents')
  })

  it('does not push when the selected route matches the current pathname', async () => {
    const user = userEvent.setup()
    pathnameState.value = '/knowledge'
    render(<UserDropdown />)

    await user.click(screen.getByRole('button', { name: /test user/i }))
    await user.click(screen.getByRole('button', { name: /knowledge bases/i }))

    expect(push).not.toHaveBeenCalled()
  })
})
