import { renderHook, act } from '@testing-library/react'
import { expect, test, describe, beforeEach, afterEach } from 'bun:test'
import { ActiveConnectionProvider, useActiveConnection } from '../src/hooks/use-active-connection'
import React from 'react'

const ACTIVE_CONNECTION_STORAGE_KEY = 'omnidump_active_connection'

describe('useActiveConnection', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ActiveConnectionProvider>{children}</ActiveConnectionProvider>
  )

  test('should restore active connection from local storage on mount', () => {
    const mockConnection = { id: 1, name: 'Test DB', driver: 'postgres' } 
    window.localStorage.setItem(ACTIVE_CONNECTION_STORAGE_KEY, JSON.stringify(mockConnection))

    const { result } = renderHook(() => useActiveConnection(), { wrapper })

    expect(result.current.isHydrated).toBe(true)
    expect(result.current.activeConnection).toEqual(mockConnection as any)
  })

  test('should write to local storage when active connection is set', () => {
    const { result } = renderHook(() => useActiveConnection(), { wrapper })

    const mockConnection = { id: 2, name: 'Test DB 2', driver: 'mysql' }

    act(() => {
      result.current.setActiveConnection(mockConnection as any)
    })

    expect(result.current.activeConnection).toEqual(mockConnection as any)
    const stored = window.localStorage.getItem(ACTIVE_CONNECTION_STORAGE_KEY)
    expect(stored).toBe(JSON.stringify(mockConnection))
  })
})
