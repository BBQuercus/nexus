'use client';
/**
 * Optimistic update pattern for mutations.
 *
 * Usage:
 *   const { mutate } = useOptimistic({
 *     mutationFn: (title) => updateConversation(id, { title }),
 *     onMutate: (title) => {
 *       // Optimistically update UI
 *       const prev = conversations
 *       updateConversationLocal(id, { title })
 *       return prev  // Return rollback data
 *     },
 *     onError: (err, data, rollback) => {
 *       // Rollback on error
 *       setConversations(rollback)
 *     },
 *   })
 */

import { useState, useCallback } from 'react'

interface UseOptimisticOptions<TData, TRollback> {
  mutationFn: (data: TData) => Promise<any>
  onMutate?: (data: TData) => TRollback
  onSuccess?: (result: any, data: TData) => void
  onError?: (error: any, data: TData, rollback?: TRollback) => void
  onSettled?: () => void
}

interface UseOptimisticResult<TData> {
  mutate: (data: TData) => Promise<void>
  isPending: boolean
  error: any
}

export function useOptimistic<TData, TRollback = any>(
  options: UseOptimisticOptions<TData, TRollback>
): UseOptimisticResult<TData> {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<any>(null)

  const mutate = useCallback(async (data: TData) => {
    setIsPending(true)
    setError(null)

    let rollback: TRollback | undefined
    if (options.onMutate) {
      rollback = options.onMutate(data)
    }

    try {
      const result = await options.mutationFn(data)
      options.onSuccess?.(result, data)
    } catch (err) {
      setError(err)
      options.onError?.(err, data, rollback)
    } finally {
      setIsPending(false)
      options.onSettled?.()
    }
  }, [options])

  return { mutate, isPending, error }
}
