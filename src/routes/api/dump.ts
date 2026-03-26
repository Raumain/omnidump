import { createFileRoute } from '@tanstack/react-router'
import { mkdirSync } from 'node:fs'
import type { DbCredentials } from '../../lib/db/connection'
import type { SavedConnection } from '../../server/connection-fns'

const BATCH_SIZE = 5000

type DumpType = 'schema' | 'data' | 'both'

const isDumpType = (value: string | null): value is DumpType =>
  value === 'schema' || value === 'data' || value === 'both'

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
        const dumpTypeParam = url.searchParams.get('dumpType')
        const connectionId = Number(connectionIdParam)
        const dumpType: DumpType = isDumpType(dumpTypeParam) ? dumpTypeParam : 'both'

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
        const connectionName =
          connection.name?.trim() || connection.database_name?.trim() || 'default'
        const safeConnectionName = connectionName.replaceAll(/[\\/:*?"<>|]/g, '_')
        const dirPath = `./exports/dumps/${safeConnectionName}/default`
        const dumpPrefix =
          dumpType === 'schema' ? 'schema' : dumpType === 'data' ? 'data' : 'dump'
        const fileName = `${dumpPrefix}_${Date.now()}.sql`
        const fullPath = `${dirPath}/${fileName}`
        mkdirSync(dirPath, { recursive: true })

        const writer = Bun.file(fullPath).writer()

        let isDestroyed = false
        const destroyDb = async () => {
          if (isDestroyed) {
            return
          }

          isDestroyed = true
          await db.destroy()
        }

        let writerClosed = false
        const closeWriter = async () => {
          if (writerClosed) {
            return
          }

          writerClosed = true
          await writer.end()
        }

        try {
          if (credentials.driver === 'postgres') {
            writer.write("SET session_replication_role = 'replica';\n\n")
          }

          if (credentials.driver === 'mysql') {
            writer.write('SET FOREIGN_KEY_CHECKS = 0;\n\n')
          }

          if (credentials.driver === 'sqlite') {
            writer.write('PRAGMA foreign_keys = OFF;\n\n')
          }

          const tables = await db.introspection.getTables()

          for (const table of tables) {
            const tableName = table.name
            const escapedTableName = escapeIdentifier(tableName)
            const columnNames = table.columns.map((column) => column.name)

            writer.write(`-- Table: ${tableName}\n`)

            if (columnNames.length === 0) {
              writer.write('\n')
              continue
            }

            if (dumpType === 'schema' || dumpType === 'both') {
              let ddl = `CREATE TABLE "${table.name}" (\n`

              ddl += table.columns
                .map(
                  (col) =>
                    `  "${col.name}" ${col.dataType} ${col.isNullable ? '' : 'NOT NULL'}`,
                )
                .join(',\n')

              ddl += '\n);\n\n'
              writer.write(ddl)
            }

            if (dumpType === 'schema') {
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

              writer.write(insertChunk)

              if (rows.length < BATCH_SIZE) {
                break
              }

              offset += BATCH_SIZE
            }

            writer.write('\n')
          }

          if (credentials.driver === 'postgres') {
            writer.write("\nSET session_replication_role = 'origin';\n")
          }

          if (credentials.driver === 'mysql') {
            writer.write('\nSET FOREIGN_KEY_CHECKS = 1;\n')
          }

          if (credentials.driver === 'sqlite') {
            writer.write('\nPRAGMA foreign_keys = ON;\n')
          }

          await closeWriter()

          return Response.json({
            success: true,
            message: 'Dump saved locally',
            path: fullPath,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'

          return Response.json(
            {
              success: false,
              error: message,
            },
            { status: 500 },
          )
        } finally {
          try {
            await closeWriter()
          } catch {
            // no-op
          }

          await destroyDb()
        }
      },
    },
  },
})
