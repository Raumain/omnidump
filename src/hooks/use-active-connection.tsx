import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import type { SavedConnection } from '../server/connection-fns'

const ACTIVE_CONNECTION_STORAGE_KEY = 'omnidump_active_connection'

type ActiveConnectionContextValue = {
  activeConnection: SavedConnection | null
  setActiveConnection: (connection: SavedConnection | null) => void
}

const ActiveConnectionContext =
  createContext<ActiveConnectionContextValue | null>(null)

const parseStoredConnection = (value: string | null): SavedConnection | null => {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as SavedConnection | null
  } catch {
    return null
  }
}

export function ActiveConnectionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [activeConnection, setActiveConnectionState] =
    useState<SavedConnection | null>(null)

  useEffect(() => {
    const storedConnection = localStorage.getItem(ACTIVE_CONNECTION_STORAGE_KEY)
    setActiveConnectionState(parseStoredConnection(storedConnection))
  }, [])

  const setActiveConnection = useCallback(
    (connection: SavedConnection | null) => {
      setActiveConnectionState(connection)
      localStorage.setItem(
        ACTIVE_CONNECTION_STORAGE_KEY,
        JSON.stringify(connection),
      )
    },
    [],
  )

  const value = useMemo(
    () => ({ activeConnection, setActiveConnection }),
    [activeConnection, setActiveConnection],
  )

  return (
    <ActiveConnectionContext.Provider value={value}>
      {children}
    </ActiveConnectionContext.Provider>
  )
}

export const useActiveConnection = () => {
  const context = useContext(ActiveConnectionContext)

  if (!context) {
    throw new Error(
      'useActiveConnection must be used within an ActiveConnectionProvider',
    )
  }

  return context
}
