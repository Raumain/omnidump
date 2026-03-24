import { Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type SubmitEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { Button } from '../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card'
import { Form, FormControl, FormItem, FormLabel } from '../components/ui/form'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { type DbCredentials } from '../lib/db/connection'
import {
  deleteConnectionFn,
  getSavedConnectionsFn,
  saveConnectionFn,
  type SavedConnection,
  testDatabaseConnection,
} from '../server/connection-fns'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const queryClient = useQueryClient()
  const [connectionName, setConnectionName] = useState('')
  const [credentials, setCredentials] = useState<DbCredentials>({
    driver: 'postgres',
    host: '',
    port: undefined,
    user: '',
    password: '',
    database: '',
  })
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(
    null,
  )

  const savedConnectionsQuery = useQuery({
    queryKey: ['saved-connections'],
    queryFn: () => getSavedConnectionsFn(),
  })

  const saveConnectionMutation = useMutation({
    mutationFn: saveConnectionFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['saved-connections'] })
    },
  })

  const deleteConnectionMutation = useMutation({
    mutationFn: deleteConnectionFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['saved-connections'] })
    },
  })

  const testConnectionMutation = useMutation({
    mutationFn: testDatabaseConnection,
  })

  const savedConnections: SavedConnection[] =
    savedConnectionsQuery.data?.success ? savedConnectionsQuery.data.connections : []

  const handleSelectConnection = (connection: SavedConnection) => {
    const driver = connection.driver
    const normalizedDriver: DbCredentials['driver'] =
      driver === 'mysql' || driver === 'sqlite' || driver === 'postgres'
        ? driver
        : 'postgres'

    setConnectionName(connection.name)
    setCredentials({
      driver: normalizedDriver,
      host: connection.host ?? '',
      port: connection.port ?? undefined,
      user: connection.user ?? '',
      password: connection.password ?? '',
      database: connection.database_name ?? '',
    })
  }

  const handleDeleteConnection = async (id: number) => {
    deleteConnectionMutation.mutate(
      { data: { id } },
      {
        onSuccess: (response) => {
          if (response.success) {
            setStatus({ success: true, message: 'Connection deleted.' })
            return
          }

          setStatus({ success: false, message: response.error })
        },
      },
    )
  }

  const handleSaveConnection = async () => {
    if (connectionName.trim() === '') {
      setStatus({ success: false, message: 'Connection alias is required.' })
      return
    }

    saveConnectionMutation.mutate(
      {
        data: {
          name: connectionName,
          ...credentials,
        },
      },
      {
        onSuccess: (response) => {
          if (response.success) {
            setStatus({ success: true, message: 'Connection saved.' })
            return
          }

          setStatus({ success: false, message: response.error })
        },
      },
    )
  }

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    testConnectionMutation.mutate(
      { data: credentials },
      {
        onSuccess: (response) => {
          if (response.success) {
            setStatus({ success: true, message: response.message })
            return
          }

          setStatus({ success: false, message: response.error })
        },
      },
    )
  }

  return (
    <main className="flex min-h-screen bg-muted/40">
      <aside className="min-h-screen min-w-[300px] border-r bg-muted/20 p-4">
        <h2 className="text-lg font-semibold">Saved Connections</h2>
        <div className="mt-4 space-y-2">
          {savedConnectionsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading connections...</p>
          ) : null}
          {savedConnections.map((connection) => (
            <button
              type="button"
              key={connection.id}
              className="w-full rounded-md border bg-background px-3 py-2 text-left hover:bg-muted/50"
              onClick={() => {
                handleSelectConnection(connection)
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{connection.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {connection.driver ?? 'unknown'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${connection.name}`}
                  disabled={deleteConnectionMutation.isPending}
                  onClick={(event) => {
                    event.stopPropagation()
                    void handleDeleteConnection(connection.id)
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>Database Connection</CardTitle>
            <CardDescription>
              Enter credentials and run a quick connection test.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form onSubmit={handleSubmit}>
              <FormItem>
                <FormLabel>Connection Alias</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    value={connectionName}
                    onChange={(event) => {
                      setConnectionName(event.target.value)
                    }}
                  />
                </FormControl>
              </FormItem>

              <FormItem>
                <FormLabel>Driver</FormLabel>
                <FormControl>
                  <Select
                    value={credentials.driver}
                    onValueChange={(value) => {
                      setCredentials((prev) => ({
                        ...prev,
                        driver: value as DbCredentials['driver'],
                      }))
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select driver" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="postgres">postgres</SelectItem>
                      <SelectItem value="mysql">mysql</SelectItem>
                      <SelectItem value="sqlite">sqlite</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>

              <FormItem>
                <FormLabel>Host</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    value={credentials.host ?? ''}
                    onChange={(event) => {
                      setCredentials((prev) => ({ ...prev, host: event.target.value }))
                    }}
                  />
                </FormControl>
              </FormItem>

              <FormItem>
                <FormLabel>Port</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    value={credentials.port ?? ''}
                    onChange={(event) => {
                      const value = event.target.value

                      setCredentials((prev) => ({
                        ...prev,
                        port: value === '' ? undefined : Number(value),
                      }))
                    }}
                  />
                </FormControl>
              </FormItem>

              <FormItem>
                <FormLabel>User</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    value={credentials.user ?? ''}
                    onChange={(event) => {
                      setCredentials((prev) => ({ ...prev, user: event.target.value }))
                    }}
                  />
                </FormControl>
              </FormItem>

              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    value={credentials.password ?? ''}
                    onChange={(event) => {
                      setCredentials((prev) => ({
                        ...prev,
                        password: event.target.value,
                      }))
                    }}
                  />
                </FormControl>
              </FormItem>

              <FormItem>
                <FormLabel>Database</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    value={credentials.database ?? ''}
                    onChange={(event) => {
                      setCredentials((prev) => ({
                        ...prev,
                        database: event.target.value,
                      }))
                    }}
                  />
                </FormControl>
              </FormItem>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  disabled={saveConnectionMutation.isPending || testConnectionMutation.isPending}
                  onClick={() => {
                    void handleSaveConnection()
                  }}
                >
                  {saveConnectionMutation.isPending ? 'Saving...' : 'Save Connection'}
                </Button>
                <Button
                  type="submit"
                  disabled={testConnectionMutation.isPending || saveConnectionMutation.isPending}
                  className="flex-1"
                >
                  {testConnectionMutation.isPending ? 'Testing...' : 'Test connection'}
                </Button>
              </div>

              {status ? (
                <div
                  className={`rounded-md border px-3 py-2 text-sm ${
                    status.success
                      ? 'border-border bg-muted text-foreground'
                      : 'border-destructive/40 bg-destructive/10 text-destructive'
                  }`}
                  role="status"
                >
                  {status.message}
                </div>
              ) : null}
            </Form>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
