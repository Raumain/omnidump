import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Download } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog'
import { Button } from '../components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card'
import type { DbCredentials } from '../lib/db/connection'
import type { SavedConnection } from '../server/connection-fns'
import { clearTableDataFn, getDatabaseSchemaFn } from '../server/schema-fns'

export const Route = createFileRoute('/schema')({ component: SchemaPage })

const getCredentialsFromConnection = (connection: SavedConnection): DbCredentials => {
  const driver = connection.driver

  const normalizedDriver: DbCredentials['driver'] =
    driver === 'mysql' || driver === 'sqlite' || driver === 'postgres'
      ? driver
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

function SchemaPage() {
  const queryClient = useQueryClient()

  const activeConnectionQuery = useQuery({
    queryKey: ['active-connection'],
    queryFn: async () => {
      const cached = queryClient.getQueryData<SavedConnection>([
        'active-connection',
      ])

      return cached ?? null
    },
    staleTime: Number.POSITIVE_INFINITY,
  })

  const activeConnection = activeConnectionQuery.data

  const schemaQuery = useQuery({
    queryKey: ['schema', activeConnection?.id],
    queryFn: async () => {
      if (!activeConnection) {
        throw new Error('No active connection selected.')
      }

      return getDatabaseSchemaFn({ data: activeConnection })
    },
    enabled: !!activeConnection,
  })

  if (!activeConnection) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>No active connection selected.</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Select a saved connection to explore its schema.
            </p>
            <Button asChild>
              <Link to="/">Back</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  const schemaData = schemaQuery.data
  const schemaError = schemaData && 'error' in schemaData ? schemaData.error : null
  const tables = schemaData && Array.isArray(schemaData) ? schemaData : []

  const clearTableMutation = useMutation({
    mutationFn: async (tableName: string) => {
      if (!activeConnection) {
        throw new Error('No active connection selected.')
      }

      const credentials = getCredentialsFromConnection(activeConnection)

      return clearTableDataFn({
        data: {
          credentials,
          tableName,
        },
      })
    },
    onSuccess: async (result, tableName) => {
      if (result.success) {
        alert(result.message)
        await queryClient.invalidateQueries({
          queryKey: ['schema', activeConnection?.id],
        })
        return
      }

      alert(result.error)
      console.error(`Failed to clear table ${tableName}:`, result.error)
    },
    onError: (error, tableName) => {
      const message = error instanceof Error ? error.message : 'Unknown error'

      alert(message)
      console.error(`Failed to clear table ${tableName}:`, message)
    },
  })

  const clearingTableName = clearTableMutation.isPending
    ? clearTableMutation.variables
    : null

  const handleDownloadDump = () => {
    const url = `/api/dump?connectionId=${activeConnection.id}`
    window.open(url, '_blank')
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Schema Explorer</h1>
          <p className="text-sm text-muted-foreground">{activeConnection.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleDownloadDump}>
            <Download />
            Download SQL Dump
          </Button>
          <Button variant="outline" asChild>
            <Link to="/import">Import CSV</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/">Back</Link>
          </Button>
        </div>
      </div>

      {schemaQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Introspecting database...</p>
      ) : null}

      {clearingTableName ? (
        <p className="text-sm text-muted-foreground">
          Clearing data from {clearingTableName}...
        </p>
      ) : null}

      {schemaError ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">{schemaError}</CardContent>
        </Card>
      ) : null}

      {!schemaQuery.isLoading && !schemaError ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tables.map((table) => (
            <Card key={table.tableName}>
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle className="text-base">{table.tableName}</CardTitle>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={clearTableMutation.isPending}
                    >
                      {clearingTableName === table.tableName ? 'Clearing...' : 'Clear Data'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear table data?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete ALL rows from {table.tableName}? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => {
                          clearTableMutation.mutate(table.tableName)
                        }}
                      >
                        {clearingTableName === table.tableName ? 'Clearing...' : 'Continue'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {table.columns.map((column) => (
                    <li
                      key={`${table.tableName}-${column.name}`}
                      className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                    >
                      <span className="truncate text-sm font-medium">{column.name}</span>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="rounded border bg-muted px-1.5 py-0.5 text-muted-foreground">
                          {column.dataType}
                        </span>
                        <span
                          className={
                            column.isNullable
                              ? 'rounded border border-border bg-muted px-1.5 py-0.5 text-muted-foreground'
                              : 'rounded border border-border bg-background px-1.5 py-0.5'
                          }
                        >
                          {column.isNullable ? 'nullable' : 'required'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}
    </main>
  )
}
