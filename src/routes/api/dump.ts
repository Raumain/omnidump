import { createFileRoute } from '@tanstack/react-router'
import type { DbCredentials } from '../../lib/db/connection'
import type { SavedConnection } from '../../server/connection-fns'

const BATCH_SIZE = 5000

const escapeIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`

const serializeValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return 'NULL'
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value)
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE'
  }

  if (value instanceof Date) {
    return `'${value.toISOString().replaceAll("'", "''")}'`
  }

  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replaceAll("'", "''")}'`
  }

  return `'${String(value).replaceAll("'", "''")}'`
}

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

export const Route = createFileRoute('/api/dump')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [{ getSavedConnectionById }, { getKyselyInstance }] = await Promise.all([
          import('../../server/saved-connections'),
          import('../../lib/db/connection'),
        ])

        const url = new URL(request.url)
        const connectionIdParam = url.searchParams.get('connectionId')
        const connectionId = Number(connectionIdParam)

        if (!connectionIdParam || Number.isNaN(connectionId)) {
          return new Response('Invalid connectionId query parameter.', {
            status: 400,
          })
        }

        const connection = getSavedConnectionById(connectionId)

        if (!connection) {
          return new Response('Connection not found.', { status: 404 })
        }

        const credentials = toDbCredentials(connection)
        const db = getKyselyInstance(credentials)
        const encoder = new TextEncoder()

        let isDestroyed = false
        const destroyDb = async () => {
          if (isDestroyed) {
            return
          }

          isDestroyed = true
          await db.destroy()
        }

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              const tables = await db.introspection.getTables()

              for (const table of tables) {
                const tableName = table.name
                const escapedTableName = escapeIdentifier(tableName)
                const columnNames = table.columns.map((column) => column.name)

                controller.enqueue(encoder.encode(`-- Table: ${tableName}\n`))

                if (columnNames.length === 0) {
                  controller.enqueue(encoder.encode('\n'))
                  continue
                }

                const escapedColumns = columnNames.map(escapeIdentifier).join(', ')
                let offset = 0

                while (true) {
                  const rows = (await db
                    .selectFrom(tableName as never)
                    .selectAll()
                    .limit(BATCH_SIZE)
                    .offset(offset)
                    .execute()) as Array<Record<string, unknown>>

                  if (rows.length === 0) {
                    break
                  }

                  const insertChunk = rows
                    .map((row) => {
                      const serializedValues = columnNames
                        .map((columnName) => serializeValue(row[columnName]))
                        .join(', ')

                      return `INSERT INTO ${escapedTableName} (${escapedColumns}) VALUES (${serializedValues});\n`
                    })
                    .join('')

                  controller.enqueue(encoder.encode(insertChunk))

                  if (rows.length < BATCH_SIZE) {
                    break
                  }

                  offset += BATCH_SIZE
                }

                controller.enqueue(encoder.encode('\n'))
              }

              controller.close()
            } catch (error) {
              controller.error(error)
            } finally {
              await destroyDb()
            }
          },
          async cancel() {
            await destroyDb()
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'application/sql',
            'Content-Disposition': 'attachment; filename="omnidump-export.sql"',
          },
        })
      },
    },
  },
})
