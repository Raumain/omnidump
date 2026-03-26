import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { type ChangeEvent, useEffect, useState } from 'react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import type { SavedConnection } from '../server/connection-fns'
import { getDatabaseSchemaFn } from '../server/schema-fns'

export const Route = createFileRoute('/import')({ component: ImportPage })

const normalizeColumnName = (name: string) =>
  name.toLowerCase().replace(/[\s_-]/g, '')

function ImportPage() {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [selectedTable, setSelectedTable] = useState('')
  const [mapping, setMapping] = useState<Record<string, string>>({})

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
              Select a saved connection to start CSV import mapping.
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
  const selectedTableColumns =
    tables.find((table) => table.tableName === selectedTable)?.columns ?? []

  const importMutation = useMutation({
    mutationFn: async (input: {
      file: File
      connectionId: number
      tableName: string
      mapping: Record<string, string>
    }) => {
      const formData = new FormData()
      formData.append('file', input.file)
      formData.append('connectionId', String(input.connectionId))
      formData.append('tableName', input.tableName)
      formData.append('mapping', JSON.stringify(input.mapping))

      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      })

      const data = (await response.json()) as
        | { success: true; message: string }
        | { success: false; error: string }

      if (!response.ok || !data.success) {
        const message = 'error' in data ? data.error : 'Import failed.'
        throw new Error(message)
      }

      return data.message
    },
    onSuccess: (message) => {
      alert(message)
      setFile(null)
      setCsvHeaders([])
      setSelectedTable('')
      setMapping({})
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Import failed.'
      alert(message)
    },
  })

  const isMappingReady =
    csvHeaders.length > 0 && csvHeaders.every((header) => Boolean(mapping[header]))
  const canImport =
    Boolean(file) &&
    Boolean(selectedTable) &&
    isMappingReady &&
    !importMutation.isPending

  useEffect(() => {
    if (!selectedTable || csvHeaders.length === 0) {
      return
    }

    const tableColumns =
      tables.find((table) => table.tableName === selectedTable)?.columns ?? []

    if (tableColumns.length === 0) {
      setMapping({})
      return
    }

    const normalizedColumnLookup = new Map<string, string>()

    for (const column of tableColumns) {
      normalizedColumnLookup.set(normalizeColumnName(column.name), column.name)
    }

    const autoMapping: Record<string, string> = {}

    for (const header of csvHeaders) {
      const matchedColumn = normalizedColumnLookup.get(
        normalizeColumnName(header),
      )

      if (matchedColumn) {
        autoMapping[header] = matchedColumn
      }
    }

    setMapping(autoMapping)
  }, [csvHeaders, selectedTable, tables])

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null

    setFile(nextFile)
    setMapping({})

    if (!nextFile) {
      setCsvHeaders([])
      return
    }

    const preview = await nextFile.slice(0, 1024).text()
    const [firstLine = ''] = preview.split('\n')
    const normalizedLine = firstLine.replace(/\r$/, '').trim()

    if (normalizedLine === '') {
      setCsvHeaders([])
      return
    }

    const commaCount = (normalizedLine.match(/,/g) ?? []).length
    const semicolonCount = (normalizedLine.match(/;/g) ?? []).length
    const delimiter = semicolonCount > commaCount ? ';' : ','

    const headers = normalizedLine
      .split(delimiter)
      .map((header) => header.trim())
      .filter((header) => header !== '')

    setCsvHeaders(headers)
  }

  const handleImport = async () => {
    if (!file || !selectedTable || !activeConnection || !isMappingReady) {
      return
    }

    importMutation.mutate({
      file,
      connectionId: activeConnection.id,
      tableName: selectedTable,
      mapping,
    })
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">CSV Import & Mapping</h1>
        <p className="text-sm text-muted-foreground">{activeConnection.name}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Select CSV File</CardTitle>
        </CardHeader>
        <CardContent>
          <Input type="file" accept=".csv" onChange={handleFileChange} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Select Target Table</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {schemaQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading schema...</p>
          ) : null}

          {schemaError ? (
            <p className="text-sm text-destructive">{schemaError}</p>
          ) : null}

          {!schemaQuery.isLoading && !schemaError ? (
            <Select
              value={selectedTable}
              onValueChange={(value) => {
                setSelectedTable(value)
                setMapping({})
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a table" />
              </SelectTrigger>
              <SelectContent>
                {tables.map((table) => (
                  <SelectItem key={table.tableName} value={table.tableName}>
                    {table.tableName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </CardContent>
      </Card>

      {file && selectedTable ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Map CSV Headers to Columns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 border-b pb-2 text-sm font-medium">
              <span>CSV Header</span>
              <span>DB Column</span>
            </div>
            <div className="mt-3 space-y-2">
              {csvHeaders.map((header) => (
                <div
                  key={header}
                  className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-2"
                >
                  <p className="truncate text-sm">{header}</p>
                  <Select
                    value={mapping[header]}
                    onValueChange={(value) => {
                      setMapping((prev) => ({ ...prev, [header]: value }))
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedTableColumns.map((column) => (
                        <SelectItem key={column.name} value={column.name}>
                          {column.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}

              {csvHeaders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No CSV headers found in the first line of the file.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2">
        <Button variant="outline" asChild>
          <Link to="/">Back</Link>
        </Button>
        <Button type="button" onClick={handleImport} disabled={!canImport}>
          {importMutation.isPending ? 'Importing...' : 'Start Import'}
        </Button>
      </div>
    </main>
  )
}
