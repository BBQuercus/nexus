import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErrorBoundary from '@/components/error-boundary'

// Mock lucide-react with explicit exports
vi.mock('lucide-react', () => ({
  AlertTriangle: (props: Record<string, unknown>) => <span data-testid="icon-alert" {...props} />,
  RotateCcw: (props: Record<string, unknown>) => <span data-testid="icon-rotate" {...props} />,
}))

// Suppress console.error from ErrorBoundary's componentDidCatch
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error message')
  }
  return <div>Child content</div>
}

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Hello World</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('catches errors and shows fallback UI', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('This section hit an error')).toBeInTheDocument()
    expect(screen.getByText('Test error message')).toBeInTheDocument()
  })

  it('shows custom fallback message when provided', () => {
    render(
      <ErrorBoundary fallbackMessage="Custom error message">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('Custom error message')).toBeInTheDocument()
  })

  it('shows a "Try again" button', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('Try again')).toBeInTheDocument()
  })

  it('recovers when "Try again" is clicked and error is resolved', async () => {
    const user = userEvent.setup()

    let shouldThrow = true
    function Wrapper() {
      if (shouldThrow) throw new Error('Temporary error')
      return <div>Recovered content</div>
    }

    render(
      <ErrorBoundary>
        <Wrapper />
      </ErrorBoundary>
    )

    expect(screen.getByText('This section hit an error')).toBeInTheDocument()

    // Fix the error condition
    shouldThrow = false

    // Click try again
    await user.click(screen.getByText('Try again'))

    // After clicking try again, the ErrorBoundary resets its state
    // and re-renders children
    expect(screen.getByText('Recovered content')).toBeInTheDocument()
  })

  it('does not show error message when there is no error object', () => {
    render(
      <ErrorBoundary>
        <div>Safe content</div>
      </ErrorBoundary>
    )
    expect(screen.queryByText('This section hit an error')).not.toBeInTheDocument()
    expect(screen.getByText('Safe content')).toBeInTheDocument()
  })
})
