import { faker } from '@faker-js/faker'
import { createFileRoute } from '@tanstack/react-router'

import type { DbCredentials } from '../../lib/db/connection'
import type { SavedConnection } from '../../server/connection-fns'

const DEFAULT_SEED_COUNT = 10
const MAX_SEED_COUNT = 1000

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

const parseSeedCount = (countParam: string | null): number => {
  if (countParam === null || countParam.trim() === '') {
    return DEFAULT_SEED_COUNT
  }

  const parsed = Number(countParam)

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('Invalid count query parameter. Must be an integer greater than 0.')
  }

  return Math.min(parsed, MAX_SEED_COUNT)
}

const shouldSkipColumn = (column: {
  name: string
  isAutoIncrementing?: boolean
}): boolean => {
  return column.name.toLowerCase() === 'id' || column.isAutoIncrementing === true
}

const getValueForColumn = (column: { name: string; dataType: string }): unknown => {
  const columnName = column.name.toLowerCase()
  const dataType = column.dataType.toLowerCase()

  if (columnName.endsWith('_id')) {
    if (dataType.includes('uuid')) {
      return faker.string.uuid()
    }

    if (dataType.includes('integer') || dataType.includes('int') || dataType.includes('numeric')) {
      return faker.number.int({ min: 1, max: 100 })
    }
  }

  if (columnName.includes('first') && columnName.includes('name')) {
    return faker.person.firstName()
  }

  if (columnName.includes('last') && columnName.includes('name')) {
    return faker.person.lastName()
  }

  if (columnName.includes('email')) {
    return faker.internet.email()
  }

  if (columnName.includes('name')) {
    return faker.company.name()
  }

  if (columnName.includes('city')) {
    return faker.location.city()
  }

  if (columnName.includes('country')) {
    return faker.location.country()
  }

  if (columnName.includes('zip') || columnName.includes('postal')) {
    return faker.location.zipCode()
  }

  if (columnName.includes('address') || columnName.includes('street')) {
    return faker.location.streetAddress()
  }

  if (columnName.includes('phone')) {
    return faker.phone.number()
  }

  if (columnName.includes('url') || columnName.includes('website')) {
    return faker.internet.url()
  }

  if (columnName.includes('company')) {
    return faker.company.name()
  }

  if (columnName.includes('description') || columnName.includes('bio')) {
    return faker.lorem.sentences(2)
  }

  if (dataType.includes('varchar') || dataType.includes('text') || dataType.includes('string')) {
    return faker.lorem.word()
  }

  if (dataType.includes('integer') || dataType.includes('int') || dataType.includes('numeric')) {
    return faker.number.int({ max: 1000 })
  }

  if (dataType.includes('boolean') || dataType.includes('bool')) {
    return faker.datatype.boolean()
  }

  if (dataType.includes('timestamp') || dataType.includes('date')) {
    return faker.date.recent().toISOString()
  }

  return faker.lorem.word()
}

export const Route = createFileRoute('/api/seed' as never)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [{ getSavedConnectionById }, { getKyselyInstance }] = await Promise.all([
          import('../../server/saved-connections'),
          import('../../lib/db/connection'),
        ])

        const url = new URL(request.url)
        const connectionIdParam = url.searchParams.get('connectionId')
        const tableName = url.searchParams.get('tableName')

        if (!connectionIdParam || Number.isNaN(Number(connectionIdParam))) {
          return Response.json(
            {
              success: false,
              error: 'Invalid connectionId query parameter.',
            },
            { status: 400 },
          )
        }

        if (!tableName || tableName.trim().length === 0) {
          return Response.json(
            {
              success: false,
              error: 'Invalid tableName query parameter.',
            },
            { status: 400 },
          )
        }

        let count = DEFAULT_SEED_COUNT

        try {
          count = parseSeedCount(url.searchParams.get('count'))
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Invalid count query parameter.'

          return Response.json(
            {
              success: false,
              error: message,
            },
            { status: 400 },
          )
        }

        const connection = getSavedConnectionById(Number(connectionIdParam))

        if (!connection) {
          return Response.json(
            {
              success: false,
              error: 'Connection not found.',
            },
            { status: 404 },
          )
        }

        const db = getKyselyInstance(toDbCredentials(connection))

        try {
          const tables = await db.introspection.getTables()
          const table = tables.find((item) => item.name === tableName)

          if (!table) {
            throw new Error(`Table not found: ${tableName}`)
          }

          const generatedRows: Array<Record<string, unknown>> = []

          for (let index = 0; index < count; index += 1) {
            const row: Record<string, unknown> = {}

            for (const rawColumn of table.columns as Array<{
              name: string
              dataType: string
              isAutoIncrementing?: boolean
            }>) {
              if (shouldSkipColumn(rawColumn)) {
                continue
              }

              row[rawColumn.name] = getValueForColumn(rawColumn)
            }

            generatedRows.push(row)
          }

          if (generatedRows.length > 0) {
            await db.insertInto(tableName as never).values(generatedRows as never).execute()
          }

          return Response.json({ success: true, inserted: generatedRows.length })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)

          return Response.json(
            {
              success: false,
              error: message,
            },
            { status: 500 },
          )
        } finally {
          await db.destroy()
        }
      },
    },
  },
})
