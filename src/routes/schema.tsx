import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Download, Loader2, AlertTriangle, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useActiveConnection } from '../hooks/use-active-connection.tsx'

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
  dropAllTablesFn,
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
  const [dumpType, setDumpType] = useState<'schema' | 'data' | 'both'>('both')
  const [schemaExportFormat, setSchemaExportFormat] = useState<'json' | 'dbml'>('json')

  const { activeConnection } = useActiveConnection()

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

  const dropAllTablesMutation = useMutation({
    mutationFn: async () => {
      if (!activeConnection) {
        throw new Error('No active connection selected.')
      }

      const credentials = getCredentialsFromConnection(activeConnection)

      return dropAllTablesFn({ data: credentials })
    },
    onSuccess: async (result) => {
      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(result.message)
      await queryClient.invalidateQueries({
        queryKey: ['schema', activeConnection?.id],
      })
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Unknown error'

      toast.error(message)
      console.error('Failed to drop all tables:', message)
    },
  })

  const dumpMutation = useMutation({
    mutationFn: async () => {
      if (!activeConnection) {
        throw new Error('No active connection selected.')
      }

      const response = await fetch(
        `/api/dump?connectionId=${activeConnection.id}&dumpType=${dumpType}`,
      )

      const result = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null

      if (!response.ok || !result?.success) {
        throw new Error(result?.error ?? 'Failed to save SQL dump.')
      }

      return result
    },
    onSuccess: () => {
      toast.success('Dump saved to server disk.')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(message)
      console.error('Failed to save SQL dump:', message)
    },
  })

  const clearingTableName = clearTableMutation.isPending
    ? clearTableMutation.variables
    : null
  const isWipingAllData = wipeAllDataMutation.isPending
  const isDroppingAllTables = dropAllTablesMutation.isPending
  const isRestoringDump = restoreDumpMutation.isPending
  const isDumping = dumpMutation.isPending
  const availableDumps = availableDumpsQuery.data ?? []

  if (!activeConnection) {
    return (
      <main className="mx-auto flex min-h-screen w-full flex-col gap-8 p-6 md:p-10 font-mono">
        <Card className="w-full max-w-md bg-background border-2 border-black dark:border-white p-6 shadow-hardware dark:shadow-hardware-dark rounded-none">
          <CardHeader>
            <CardTitle className="text-2xl font-black uppercase tracking-wider">No active connection selected.</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3 pt-6">
            <p className="text-sm font-bold uppercase">
              Select a saved connection to explore its schema.
            </p>
            <Button asChild className="rounded-none border-2 border-black shadow-hardware active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase bg-zinc-100 text-black hover:bg-zinc-200">
              <Link to="/">Back</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen w-full flex-col gap-8 p-6 md:p-10 font-mono">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between bg-zinc-950 p-6 border-2 border-black dark:border-white shadow-hardware dark:shadow-hardware-dark">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-wider text-white">Schema Explorer</h1>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest">{activeConnection.name}</span>
            <div className="bg-black border-2 border-orange-500 px-3 py-1 text-orange-500 font-black text-xl tracking-widest flex items-center gap-2">
              <span className="text-[10px] uppercase text-orange-700">TABLES:</span>
              <span className="animate-pulse">{tables.length.toString().padStart(3, '0')}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-zinc-100 p-2 border-2 border-black">
            <Select
              value={schemaExportFormat}
              onValueChange={(value) => {
                setSchemaExportFormat(value as 'json' | 'dbml')
              }}
            >
              <SelectTrigger className="w-[140px] rounded-none border-2 border-black shadow-hardware text-black font-bold uppercase disabled:opacity-50">
                <SelectValue placeholder="Format" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-2 border-black shadow-hardware font-mono">
                <SelectItem value="json" className="font-bold uppercase rounded-none focus:bg-zinc-200 hover:!bg-zinc-400 bg-white text-black cursor-pointer">Export JSON</SelectItem>
                <SelectItem value="dbml" className="font-bold uppercase rounded-none focus:bg-zinc-200 hover:!bg-zinc-400 bg-white text-black cursor-pointer">Export DBML</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={() => {
                window.location.href = `/api/export-schema?connectionId=${activeConnection.id}&format=${schemaExportFormat}`
              }}
              disabled={
                isDumping ||
                isWipingAllData ||
                isDroppingAllTables ||
                clearTableMutation.isPending ||
                isRestoringDump
              }
              className="rounded-none border-2 border-black shadow-hardware active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase bg-zinc-100 text-black hover:bg-zinc-200"
            >
              Export Schema
            </Button>
          </div>

          <div className="flex items-center gap-2 bg-zinc-100 p-2 border-2 border-black">
            <Select
              value={dumpType}
              onValueChange={(value) => {
                setDumpType(value as 'schema' | 'data' | 'both')
              }}
            >
              <SelectTrigger className="w-[150px] rounded-none border-2 border-black shadow-hardware text-black font-bold uppercase disabled:opacity-50">
                <SelectValue placeholder="Dump type" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-2 border-black shadow-hardware font-mono">
                <SelectItem value="schema" className="font-bold uppercase rounded-none focus:bg-zinc-200  hover:!bg-zinc-400 bg-white text-black cursor-pointer">Schema Only</SelectItem>
                <SelectItem value="data" className="font-bold uppercase rounded-none focus:bg-zinc-200  hover:!bg-zinc-400 bg-white text-black cursor-pointer">Data Only</SelectItem>
                <SelectItem value="both" className="font-bold uppercase rounded-none focus:bg-zinc-200  hover:!bg-zinc-400 bg-white text-black cursor-pointer">Schema + Data</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={() => {
                dumpMutation.mutate()
              }}
              disabled={
                isDumping ||
                isWipingAllData ||
                isDroppingAllTables ||
                clearTableMutation.isPending ||
                isRestoringDump
              }
              className="rounded-none border-2 border-black shadow-hardware active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase bg-zinc-100 text-black hover:bg-zinc-200"
            >
              {isDumping ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Download className="w-4 h-4 mr-2" />}
              {isDumping ? 'Saving...' : 'Dump SQL'}
            </Button>
          </div>

          <Button
            type="button"
            disabled={
              isWipingAllData ||
              isDroppingAllTables ||
              clearTableMutation.isPending ||
              isRestoringDump
            }
            onClick={() => {
              setIsRestoreModalOpen(true)
            }}
            className="rounded-none border-2 border-black shadow-hardware active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase bg-orange-500 text-black hover:bg-orange-600"
          >
            Restore
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                disabled={
                  wipeAllDataMutation.isPending ||
                  dropAllTablesMutation.isPending ||
                  clearTableMutation.isPending
                }
                className="rounded-none border-2 border-black shadow-hardware active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase bg-red-600 text-white hover:bg-red-700 flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4" />
                {isWipingAllData ? 'Wiping...' : 'Wipe Data'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-none border-4 border-red-600 shadow-hardware font-mono p-6">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-2xl font-black uppercase text-red-600 flex items-center gap-2">
                  <AlertTriangle className="w-6 h-6" /> Wipe all data?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-black dark:text-zinc-300 font-bold">
                  WARNING: This will delete ALL data across ALL tables in this database. The schema will remain intact. This action is irreversible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-6">
                <AlertDialogCancel className="rounded-none border-2 border-black shadow-hardware active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    wipeAllDataMutation.mutate()
                  }}
                  className="rounded-none border-2 border-black shadow-hardware active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase bg-red-600 text-white hover:bg-red-700"
                >
                  {isWipingAllData ? 'Wiping...' : 'Execute Wipe'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                disabled={
                  dropAllTablesMutation.isPending ||
                  wipeAllDataMutation.isPending ||
                  clearTableMutation.isPending ||
                  isRestoringDump
                }
                className="rounded-none border-2 border-black shadow-hardware active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase bg-red-600 text-white hover:bg-red-700 flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4" />
                {isDroppingAllTables ? 'Dropping...' : 'Drop Total'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-none border-4 border-red-600 shadow-hardware font-mono p-6">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-2xl font-black uppercase text-red-600 flex items-center gap-2">
                  <AlertTriangle className="w-6 h-6" /> Drop all tables?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-black dark:text-zinc-300 font-bold">
                  DANGER: This will completely DESTROY ALL TABLES and their data. Your database schema will be wiped clean. You will need to rerun your ORM migrations to rebuild the structure. This is completely irreversible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-6">
                <AlertDialogCancel className="rounded-none border-2 border-black shadow-hardware active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    dropAllTablesMutation.mutate()
                  }}
                  className="rounded-none border-2 border-black shadow-hardware active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase bg-red-600 text-white hover:bg-red-700"
                >
                  {isDroppingAllTables ? 'Dropping...' : 'Execute Drop'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
        <DialogContent className="rounded-none border-4 border-black shadow-hardware font-mono sm:max-w-xl md:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase text-foreground">Restore local SQL dump</DialogTitle>
            <DialogDescription className="text-white font-bold">
              Select a dump from the exports directory to restore it into the active database.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-4">
            {availableDumpsQuery.isLoading ? (
              <p className="text-sm font-bold uppercase animate-pulse">Loading dumps...</p>
            ) : null}

            {!availableDumpsQuery.isLoading && availableDumps.length === 0 ? (
              <p className="text-sm font-bold uppercase text-red-600">No SQL dumps found in exports/.</p>
            ) : null}

            {availableDumps.length > 0 ? (
              <div className="border-2 border-black p-2 bg-zinc-100 shadow-inner">
                <Select value={selectedDumpPath} onValueChange={setSelectedDumpPath}>
                  <SelectTrigger className="w-full rounded-none border-2 border-black bg-white text-black shadow-hardware font-bold">
                    <SelectValue placeholder="Select a .sql dump file" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-2 border-black shadow-hardware font-mono">
                    {availableDumps.map((filePath) => (
                      <SelectItem key={filePath} value={filePath} className="rounded-none cursor-pointer  hover:!bg-zinc-400 bg-white text-black focus:bg-zinc-200">
                        {filePath}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" disabled={isRestoringDump} className="rounded-none border-2 border-black shadow-hardware active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase bg-zinc-200 text-black hover:bg-zinc-300">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={
                isRestoringDump ||
                availableDumpsQuery.isLoading ||
                !selectedDumpPath
              }
              onClick={() => {
                restoreDumpMutation.mutate(selectedDumpPath)
              }}
              className="rounded-none border-2 border-black shadow-hardware active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase bg-orange-500 text-black hover:bg-orange-600"
            >
              {isRestoringDump ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : null}
              {isRestoringDump ? 'Restoring...' : 'Confirm Restore'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {schemaQuery.isLoading ? (
        <div className="flex items-center gap-3 bg-zinc-950 text-white p-4 border-2 border-black shadow-hardware">
          <Loader2 className="animate-spin w-6 h-6 text-orange-500" />
          <p className="text-xl font-black uppercase tracking-widest text-orange-500 blink">Introspecting database...</p>
        </div>
      ) : null}

      {clearingTableName ? (
        <div className="flex items-center gap-3 bg-red-600 text-white p-4 border-2 border-black shadow-hardware">
          <Loader2 className="animate-spin w-6 h-6" />
          <p className="text-xl font-black uppercase tracking-widest">Clearing {clearingTableName}...</p>
        </div>
      ) : null}

      {isWipingAllData ? (
        <div className="flex items-center gap-3 bg-red-600 text-white p-4 border-2 border-black shadow-hardware">
          <Loader2 className="animate-spin w-6 h-6" />
          <p className="text-xl font-black uppercase tracking-widest">Wiping complete sector...</p>
        </div>
      ) : null}

      {isDroppingAllTables ? (
        <div className="flex items-center gap-3 bg-red-600 text-white p-4 border-2 border-black shadow-hardware">
          <Loader2 className="animate-spin w-6 h-6" />
          <p className="text-xl font-black uppercase tracking-widest">Dropping structural core...</p>
        </div>
      ) : null}

      {schemaError ? (
        <Card className="rounded-none border-4 border-red-600 bg-black text-red-500 shadow-hardware">
          <CardContent className="pt-6">
            <h2 className="text-xl font-black uppercase mb-2 flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> Error</h2>
            <p className="font-mono text-sm">{schemaError}</p>
          </CardContent>
        </Card>
      ) : null}

      {!schemaQuery.isLoading && !schemaError ? (
        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tables.map((table) => (
            <Card key={table.tableName} className="rounded-none border-2 border-black dark:border-white p-0 bg-zinc-50 dark:bg-zinc-950 shadow-hardware dark:shadow-hardware-dark flex flex-col h-full">
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 bg-black text-white p-4 border-b-2 border-black dark:border-white">
                <CardTitle className="text-lg font-black uppercase tracking-widest truncate">{table.tableName}</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => {
                      window.location.href = `/api/export-csv?connectionId=${activeConnection.id}&tableName=${table.tableName}`
                    }}
                    disabled={
                      clearTableMutation.isPending ||
                      isDroppingAllTables ||
                      isWipingAllData ||
                      isRestoringDump ||
                      isDumping
                    }
                    className="bg-zinc-200 dark:bg-zinc-800 border-2 border-black dark:border-white text-xs font-bold uppercase p-2 shadow-hardware active:translate-y-[2px] active:shadow-none transition-all rounded-none text-black dark:text-white"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    EXTRACT_CSV
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        disabled={clearTableMutation.isPending || isDroppingAllTables}
                        className="rounded-none border-2 border-white shadow-hardware-dark active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase bg-red-600 text-white hover:bg-red-700 h-8 text-[10px]"
                      >
                        {clearingTableName === table.tableName ? 'WAIT' : 'CLEAR'}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-none border-4 border-red-600 shadow-hardware font-mono p-6">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-2xl font-black uppercase text-red-600 flex items-center gap-2">
                          <AlertTriangle className="w-6 h-6" /> Clear Data?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-black dark:text-gray-300 font-bold">
                          Delete ALL rows from {table.tableName}? Unrecoverable.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="mt-6">
                        <AlertDialogCancel className="rounded-none border-2 border-black shadow-hardware active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            clearTableMutation.mutate(table.tableName)
                          }}
                          className="rounded-none border-2 border-black shadow-hardware active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-bold uppercase bg-red-600 text-white hover:bg-red-700"
                        >
                          {clearingTableName === table.tableName ? 'Clearing...' : 'Confirm Clear'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardHeader>
              <CardContent className="p-4 flex-grow overflow-x-auto">
                <ul className="space-y-1">
                  {table.columns.map((column) => (
                    <li
                      key={`${table.tableName}-${column.name}`}
                      className="flex items-center justify-between gap-4 border-b-2 border-zinc-200 dark:border-zinc-800 pb-1 last:border-0"
                    >
                      <div className="flex items-center gap-2 max-w-[60%]">
                        {column.name.toLowerCase().includes('id') || column.name.toLowerCase().includes('key') ? (
                          <KeyRound className="w-3 h-3 text-orange-500 shrink-0" />
                        ) : (
                          <span className="w-3 h-3 block shrink-0" />
                        )}
                        <span className="truncate text-sm font-bold">{column.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold shrink-0">
                        <span className="bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white px-1.5 py-0.5 border border-zinc-300 dark:border-zinc-700">
                          {column.dataType}
                        </span>
                        <span
                          className={
                            column.isNullable
                              ? 'bg-transparent text-zinc-400 border border-zinc-300 dark:border-zinc-700 px-1.5 py-0.5 decoration-zinc-400'
                              : 'bg-black text-white dark:bg-white dark:text-black px-1.5 py-0.5'
                          }
                        >
                          {column.isNullable ? 'NULL' : 'REQ'}
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
