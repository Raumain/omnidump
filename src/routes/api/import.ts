import { createFileRoute } from '@tanstack/react-router'
import { parse } from 'csv-parse'

import type { DbCredentials } from '../../lib/db/connection'
import type { SavedConnection } from '../../server/connection-fns'

const IMPORT_BATCH_SIZE = 1000

const toDbCredentials = (connection: SavedConnection): DbCredentials => {
  const normalizedDriver: DbCredentials['driver'] =
    connection.driver === 'mysql' ||
      connection.driver === 'sqlite' ||
      connection.driver === 'postgres'
      ? connection.driver
      : 'postgres'

  return {
    driver: normalizedDriver,
    host: connection.host ?? undefined,
    port: connection.port ?? undefined,
    user: connection.user ?? undefined,
    password: connection.password ?? undefined,
    database: connection.database_name ?? undefined,
  }
}

const isRecordStringMap = (value: unknown): value is Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return Object.values(value).every((entry) => typeof entry === 'string')
}

export const Route = createFileRoute('/api/import')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [{ getSavedConnectionById }, { getKyselyInstance }] = await Promise.all([
          import('../../server/saved-connections'),
          import('../../lib/db/connection'),
        ])

        const formData = await request.formData()
        const file = formData.get('file')
        const connectionId = formData.get('connectionId')
        const tableName = formData.get('tableName')
        const mappingRaw = formData.get('mapping')

        if (!(file instanceof File)) {
          return Response.json({ success: false, error: 'Missing CSV file.' }, { status: 400 })
        }

        if (typeof connectionId !== 'string' || connectionId.trim() === '') {
          return Response.json({ success: false, error: 'Missing connectionId.' }, { status: 400 })
        }

        if (typeof tableName !== 'string' || tableName.trim() === '') {
          return Response.json({ success: false, error: 'Missing tableName.' }, { status: 400 })
        }

        if (typeof mappingRaw !== 'string') {
          return Response.json({ success: false, error: 'Missing mapping.' }, { status: 400 })
        }

        let mapping: Record<string, string>

        try {
          const parsed = JSON.parse(mappingRaw) as unknown

          if (!isRecordStringMap(parsed)) {
            return Response.json({ success: false, error: 'Invalid mapping format.' }, { status: 400 })
          }

          mapping = parsed
        } catch {
          return Response.json({ success: false, error: 'Mapping must be valid JSON.' }, { status: 400 })
        }

        const parsedConnectionId = Number(connectionId)

        if (Number.isNaN(parsedConnectionId)) {
          return Response.json({ success: false, error: 'Invalid connectionId.' }, { status: 400 })
        }

        const connection = getSavedConnectionById(parsedConnectionId)

        if (!connection) {
          return Response.json({ success: false, error: 'Connection not found.' }, { status: 404 })
        }

        const db = getKyselyInstance(toDbCredentials(connection))

        try {
          const parser = parse({
            columns: true,
            skip_empty_lines: true,
            delimiter: [',', ';'],
          })

          const streamReader = file.stream().getReader()
          const pumpStreamToParser = (async () => {
            try {
              while (true) {
                const { done, value } = await streamReader.read()

                if (done) {
                  break
                }

                if (value) {
                  parser.write(value)
                }
              }

              parser.end()
            } catch (error) {
              parser.destroy(error as Error)
            } finally {
              streamReader.releaseLock()
            }
          })()

          let batch: Array<Record<string, unknown>> = []

          for await (const record of parser) {
            const mappedRow: Record<string, unknown> = {}

            for (const [csvHeader, dbColumn] of Object.entries(mapping)) {
              if (!dbColumn) {
                continue
              }

              mappedRow[dbColumn] = record[csvHeader]
            }

            if (Object.keys(mappedRow).length === 0) {
              continue
            }

            batch.push(mappedRow)

            if (batch.length >= IMPORT_BATCH_SIZE) {
              await db.insertInto(tableName as never).values(batch as never).execute()
              batch = []
            }
          }

          if (batch.length > 0) {
            await db.insertInto(tableName as never).values(batch as never).execute()
          }

          await pumpStreamToParser

          return Response.json({ success: true, message: 'Import complete' })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Import failed.'
          return Response.json({ success: false, error: message }, { status: 500 })
        } finally {
          await db.destroy()
        }
      },
    },
  },
})
