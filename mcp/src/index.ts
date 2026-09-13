#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { TempoClient, TempoError } from './client.js'
import { createHandlers, schemas } from './tools.js'

const baseUrl = process.env.TEMPO_API_URL ?? 'https://tempo.local.playquota.com'
const token = process.env.TEMPO_TOKEN

if (!token) {
  // stderr, never stdout: stdout carries the MCP protocol itself.
  process.stderr.write(
    'TEMPO_TOKEN is not set. Create a token while signed in to Tempo:\n' +
    '  curl -X POST <tempo>/api/tokens -H "Content-Type: application/json" ' +
    '-b <session cookie> -d \'{"name":"claude"}\'\n',
  )
  process.exit(1)
}

const client = new TempoClient({ baseUrl, token })
const handlers = createHandlers(client)
const server = new McpServer({ name: 'tempo', version: '0.1.0' })

/**
 * Failures come back as tool errors with the API's own message. Reporting a
 * failed write as success is the worst outcome for an agent, so nothing here
 * swallows an error.
 */
function wrap<T>(handler: (input: T) => Promise<string>) {
  return async (input: T) => {
    try {
      return { content: [{ type: 'text' as const, text: await handler(input) }] }
    } catch (error) {
      const message = error instanceof TempoError
        ? error.message
        : error instanceof Error ? error.message : String(error)
      return { content: [{ type: 'text' as const, text: message }], isError: true }
    }
  }
}

server.tool('list_projects', 'List the projects on the Tempo account, with their ids and daily targets.',
  schemas.listProjects, wrap(handlers.list_projects))

server.tool('create_project', 'Create a new project to track time against.',
  schemas.createProject, wrap(handlers.create_project))

server.tool('update_project', 'Rename, recolour, retarget, reorder or archive an existing project.',
  schemas.updateProject, wrap(handlers.update_project))

server.tool('log_time', 'Record time actually worked on a project. Defaults to today.',
  schemas.logTime, wrap(handlers.log_time))

server.tool('plan_time', 'Record time intended for a project on a date, without claiming it was worked.',
  schemas.planTime, wrap(handlers.plan_time))

server.tool('timer_status', 'Report whether a timer is running, for which project, and for how long.',
  schemas.timerStatus, wrap(handlers.timer_status))

server.tool('start_timer', 'Start timing work on a project now. Only one timer can run at a time.',
  schemas.startTimer, wrap(handlers.start_timer))

server.tool('stop_timer', 'Stop the running timer and log the elapsed time as an activity.',
  schemas.stopTimer, wrap(handlers.stop_timer))

server.tool('discard_timer', 'Cancel the running timer without logging anything.',
  schemas.discardTimer, wrap(handlers.discard_timer))

server.tool('month_overview', 'Summarise planned and actual time for a month.',
  schemas.monthOverview, wrap(handlers.month_overview))

await server.connect(new StdioServerTransport())
