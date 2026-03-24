import '@tanstack/react-start/server-only'

import type { SavedConnection } from './connection-fns'
import { db } from './internal-db'

export const getSavedConnectionById = (id: number): SavedConnection | null => {
  const connection = db
    .query(
      `
      SELECT *
      FROM saved_connections
      WHERE id = ?
      LIMIT 1
    `,
    )
    .get(id) as SavedConnection | null

  return connection ?? null
}
