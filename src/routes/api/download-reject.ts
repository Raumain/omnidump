import { createFileRoute } from '@tanstack/react-router'
import { basename } from 'node:path'

export const Route = createFileRoute('/api/download-reject')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const fileName = url.searchParams.get('fileName')

        if (!fileName || fileName.trim() === '') {
          return new Response('Missing fileName query parameter.', { status: 400 })
        }

        const normalizedFileName = basename(fileName)

        if (normalizedFileName !== fileName) {
          return new Response('Invalid fileName query parameter.', { status: 400 })
        }

        const filePath = `./exports/${normalizedFileName}`
        const file = Bun.file(filePath)

        if (!(await file.exists())) {
          return new Response('Reject file not found.', { status: 404 })
        }

        return new Response(file, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${normalizedFileName}"`,
          },
        })
      },
    },
  },
})
