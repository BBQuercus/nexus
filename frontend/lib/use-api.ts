/**
 * Standardized API request hook with loading, error, retry, and degraded states.
 *
 * Usage:
 *   const { data, error, loading, execute, retry } = useApi<ConversationType[]>()
 *
 *   useEffect(() => { execute(() => fetchConversations()) }, [])
 */

import { useState, useCallback, useRef } from 'react'
import { ApiError } from './api'
import type { RequestError } from './request-types'

export type { RequestError }
export type RequestStatus = 'idle' | 'loading' | 'success' | 'error' | 'retrying'

export interface UseApiOptions {
  retryCount?: number
  retryDelay?: number
  onSuccess?: (data: any) => void
  onError?: (error: RequestError) => void
}

export interface UseApiResult<T> {
  data: T | null
  error: RequestError | null
  status: RequestStatus
  loading: boolean
  execute: (fn: () => Promise<T>) => Promise<T | null>
  retry: () => Promise<T | null>
  reset: () => void
}

export function useApi<T>(options: UseApiOptions = {}): UseApiResult<T> {
  const { retryCount = 0, retryDelay = 1000, onSuccess, onError } = options

  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<RequestError | null>(null)
  const [status, setStatus] = useState<RequestStatus>('idle')
  const lastFnRef = useRef<(() => Promise<T>) | null>(null)
  const retryCountRef = useRef(0)

  const execute = useCallback(async (fn: () => Promise<T>): Promise<T | null> => {
    lastFnRef.current = fn
    retryCountRef.current = 0
    setStatus('loading')
    setError(null)

    try {
      const result = await fn()
      setData(result)
      setStatus('success')
      onSuccess?.(result)
      return result
    } catch (err: any) {
      const apiError = parseError(err)
      setError(apiError)
      setStatus('error')
      onError?.(apiError)
      return null
    }
  }, [onSuccess, onError])

  const retry = useCallback(async (): Promise<T | null> => {
    if (!lastFnRef.current) return null
    if (retryCountRef.current >= retryCount) return null

    retryCountRef.current++
    setStatus('retrying')

    await new Promise(resolve => setTimeout(resolve, retryDelay * retryCountRef.current))

    try {
      const result = await lastFnRef.current()
      setData(result)
      setStatus('success')
      onSuccess?.(result)
      return result
    } catch (err: any) {
      const apiError = parseError(err)
      setError(apiError)
      setStatus('error')
      onError?.(apiError)
      return null
    }
  }, [retryCount, retryDelay, onSuccess, onError])

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setStatus('idle')
    retryCountRef.current = 0
  }, [])

  return {
    data,
    error,
    status,
    loading: status === 'loading' || status === 'retrying',
    execute,
    retry,
    reset,
  }
}

function parseError(err: any): RequestError {
  // Handle the existing ApiError class from api.ts
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return {
        code: 'rate_limited',
        message: err.message || 'Too many requests. Please wait.',
        statusCode: 429,
        requestId: err.requestId,
        retryAfter: 60,
        isRetryable: true,
      }
    }

    if (err.status === 401) {
      return {
        code: 'unauthorized',
        message: 'Session expired. Please log in again.',
        statusCode: 401,
        requestId: err.requestId,
        isRetryable: false,
      }
    }

    if (err.status >= 500) {
      return {
        code: 'server_error',
        message: err.message || 'Server error. Please try again.',
        statusCode: err.status,
        requestId: err.requestId,
        isRetryable: true,
      }
    }

    return {
      code: 'api_error',
      message: err.message || 'An API error occurred.',
      statusCode: err.status,
      requestId: err.requestId,
      isRetryable: false,
    }
  }

  if (err instanceof TypeError && err.message.includes('fetch')) {
    return {
      code: 'network_error',
      message: 'Network error. Check your connection.',
      isRetryable: true,
    }
  }

  return {
    code: err?.code || 'unknown',
    message: err?.message || 'An unexpected error occurred.',
    statusCode: err?.statusCode,
    requestId: err?.requestId,
    isRetryable: false,
  }
}

export { parseError }
