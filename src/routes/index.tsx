import { useState } from 'react'
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
import { testDatabaseConnection } from '../server/connection-fns'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const [credentials, setCredentials] = useState<DbCredentials>({
    driver: 'postgres',
    host: '',
    port: undefined,
    user: '',
    password: '',
    database: '',
  })
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof testDatabaseConnection>
  > | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      const response = await testDatabaseConnection({ data: credentials })
      setResult(response)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
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

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Testing...' : 'Test connection'}
            </Button>

            {result ? (
              <div
                className={`rounded-md border px-3 py-2 text-sm ${
                  result.success
                    ? 'border-border bg-muted text-foreground'
                    : 'border-destructive/40 bg-destructive/10 text-destructive'
                }`}
                role="status"
              >
                {result.success ? result.message : result.error}
              </div>
            ) : null}
          </Form>
        </CardContent>
      </Card>
    </main>
  )
}
