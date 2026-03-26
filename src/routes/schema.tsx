import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import type { DbCredentials } from '../lib/db/connection'
import type { SavedConnection } from '../server/connection-fns'
import {
  clearTableDataFn,
  getAvailableDumpsFn,
  getDatabaseSchemaFn,
  restoreDumpFn,
  wipeAllDataFn,
} from '../server/schema-fns'

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
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false)
  const [selectedDumpPath, setSelectedDumpPath] = useState('')
  const [isDumping, setIsDumping] = useState(false)

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

  const availableDumpsQuery = useQuery({
    queryKey: ['available-dumps'],
    queryFn: async () => getAvailableDumpsFn(),
    enabled: isRestoreModalOpen,
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

  const wipeAllDataMutation = useMutation({
    mutationFn: async () => {
      if (!activeConnection) {
        throw new Error('No active connection selected.')
      }

      const credentials = getCredentialsFromConnection(activeConnection)

      return wipeAllDataFn({ data: credentials })
    },
    onSuccess: async (result) => {
      if (result.success) {
        alert(result.message)
        await queryClient.invalidateQueries({
          queryKey: ['schema', activeConnection?.id],
        })
        return
      }

      alert(result.error)
      console.error('Failed to wipe all data:', result.error)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Unknown error'

      alert(message)
      console.error('Failed to wipe all data:', message)
    },
  })

  const restoreDumpMutation = useMutation({
    mutationFn: async (filePath: string) => {
      if (!activeConnection) {
        throw new Error('No active connection selected.')
      }

      const credentials = getCredentialsFromConnection(activeConnection)

      return restoreDumpFn({
        data: {
          credentials,
          filePath,
        },
      })
    },
    onSuccess: async (result) => {
      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success('Dump restored successfully.')
      setIsRestoreModalOpen(false)
      setSelectedDumpPath('')
      await queryClient.invalidateQueries({
        queryKey: ['schema', activeConnection?.id],
      })
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Unknown error'

      toast.error(message)
      console.error('Failed to restore dump:', message)
    },
  })

  const clearingTableName = clearTableMutation.isPending
    ? clearTableMutation.variables
    : null
  const isWipingAllData = wipeAllDataMutation.isPending
  const isRestoringDump = restoreDumpMutation.isPending
  const availableDumps = availableDumpsQuery.data ?? []

  const handleDownloadDump = async () => {
    setIsDumping(true)

    try {
      const response = await fetch(`/api/dump?connectionId=${activeConnection.id}`)

      const result = await response.json().catch(() => null) as
        | { success?: boolean; error?: string }
        | null

      if (!response.ok || !result?.success) {
        const message = result?.error ?? 'Failed to save SQL dump.'
        toast.error(message)
        return
      }

      toast.success('Dump saved to server disk.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(message)
      console.error('Failed to save SQL dump:', message)
    } finally {
      setIsDumping(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Schema Explorer</h1>
          <p className="text-sm text-muted-foreground">{activeConnection.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => {
              void handleDownloadDump()
            }}
            disabled={isDumping || isWipingAllData || clearTableMutation.isPending || isRestoringDump}
          >
            {isDumping ? <Loader2 className="animate-spin" /> : <Download />}
            {isDumping ? 'Saving Dump...' : 'Download SQL Dump'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isWipingAllData || clearTableMutation.isPending || isRestoringDump}
            onClick={() => {
              setIsRestoreModalOpen(true)
            }}
          >
            Restore Dump
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                disabled={wipeAllDataMutation.isPending || clearTableMutation.isPending}
              >
                {isWipingAllData ? 'Wiping...' : 'Wipe All Data'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Wipe all data?</AlertDialogTitle>
                <AlertDialogDescription>
                  WARNING: This will delete ALL data across ALL tables in this database. The schema will remain intact. This action is irreversible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    wipeAllDataMutation.mutate()
                  }}
                >
                  {isWipingAllData ? 'Wiping...' : 'Continue'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" asChild>
            <Link to="/import">Import CSV</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/">Back</Link>
          </Button>
        </div>
      </div>

      <Dialog
        open={isRestoreModalOpen}
        onOpenChange={(open) => {
          setIsRestoreModalOpen(open)

          if (!open) {
            setSelectedDumpPath('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore local SQL dump</DialogTitle>
            <DialogDescription>
              Select a dump from the exports directory to restore it into the active database.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {availableDumpsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading dumps...</p>
            ) : null}

            {!availableDumpsQuery.isLoading && availableDumps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No SQL dumps found in exports/.</p>
            ) : null}

            {availableDumps.length > 0 ? (
              <Select value={selectedDumpPath} onValueChange={setSelectedDumpPath}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a .sql dump file" />
                </SelectTrigger>
                <SelectContent>
                  {availableDumps.map((filePath) => (
                    <SelectItem key={filePath} value={filePath}>
                      {filePath}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isRestoringDump}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={
                isRestoringDump ||
                availableDumpsQuery.isLoading ||
                !selectedDumpPath
              }
              onClick={() => {
                restoreDumpMutation.mutate(selectedDumpPath)
              }}
            >
              {isRestoringDump ? <Loader2 className="animate-spin" /> : null}
              {isRestoringDump ? 'Restoring...' : 'Confirm Restore'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {schemaQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Introspecting database...</p>
      ) : null}

      {clearingTableName ? (
        <p className="text-sm text-muted-foreground">
          Clearing data from {clearingTableName}...
        </p>
      ) : null}

      {isWipingAllData ? (
        <p className="text-sm text-muted-foreground">Wiping data from all tables...</p>
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
