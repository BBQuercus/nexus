/**
 * Standard request lifecycle types shared across the application.
 */

export type RequestStatus = 'idle' | 'loading' | 'streaming' | 'success' | 'error' | 'partial' | 'degraded' | 'cancelled'

export interface RequestState<T> {
  status: RequestStatus
  data: T | null
  error: RequestError | null
  lastUpdated: number | null
}

export interface RequestError {
  code: string
  message: string
  statusCode?: number
  requestId?: string
  retryAfter?: number
  isRetryable: boolean
  details?: Record<string, any>
}

export interface DegradedService {
  name: string
  status: 'unavailable' | 'slow' | 'partial'
  message: string
  fallback?: string
}

export function createRequestState<T>(initial?: T): RequestState<T> {
  return {
    status: 'idle',
    data: initial ?? null,
    error: null,
    lastUpdated: null,
  }
}

export function isLoading(state: RequestState<any>): boolean {
  return state.status === 'loading' || state.status === 'streaming'
}

export function hasError(state: RequestState<any>): boolean {
  return state.status === 'error'
}

export function isSuccess(state: RequestState<any>): boolean {
  return state.status === 'success' || state.status === 'partial' || state.status === 'degraded'
}
