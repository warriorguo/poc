# Letting an assistant manage your Tempo account

Tempo exposes an MCP server so an assistant can list and create projects, log
hours and summarise a month, using a personal API token rather than your
password.

## 1. Create your account

Open <https://tempo.local.playquota.com/> and choose **Create an account
instead**. Registration seeds your four starter projects.

## 2. Create an API token

In the topbar, click **API tokens**, give it a name (`claude`), and press
**Create**. The secret is shown once and never again — copy it now.

Tokens can read and write everything in your account, so treat one like a
password. Revoke it from the same dialog if it leaks. A token deliberately
*cannot* create other tokens: that needs a password sign-in.

## 3. Build the MCP server

```bash
cd mcp
npm install
npm run build
```

## 4. Point Claude Code at it

```bash
claude mcp add tempo \
  --env TEMPO_API_URL=https://tempo.local.playquota.com \
  --env TEMPO_TOKEN=tempo_your_token_here \
  -- node /absolute/path/to/poc/mcp/dist/index.js
```

Then ask in plain language:

> Set up a project called Piano Practice with a 45 minute daily target
> Log 90 minutes on OZX today, note "combat prototype"
> How did September go?

## Tools

| Tool | What it does |
| --- | --- |
| `list_projects` | Project ids, names and daily targets |
| `create_project` | New project; a name alone is enough |
| `update_project` | Rename, recolour, retarget, reorder, archive |
| `log_time` | Record time actually worked; defaults to today |
| `plan_time` | Record intended time, not yet worked |
| `month_overview` | Planned vs actual for a month, broken down by project |

`log_time` and `plan_time` are deliberately separate: a plan is an intention and
an activity is a fact, and the calendar renders them differently. An assistant
that is guessing should use `plan_time`.

## ChatGPT

**Not yet possible without more work.** ChatGPT runs on OpenAI's servers.
`tempo.local.playquota.com` resolves publicly but answers `192.168.0.169`, an
address reachable only from your LAN, so OpenAI cannot connect to it.

Two routes, neither done here:

1. **If your ChatGPT client supports local MCP servers** — point it at
   `mcp/dist/index.js` exactly as Claude Code is configured above. Verify your
   client actually runs local stdio servers; connectors that take a URL do not.
2. **Expose Tempo publicly** through a tunnel (Cloudflare Tunnel, ngrok) and use
   a custom GPT Action against the REST API with the token as a bearer header.
   This puts your planner on the public internet. Close open registration first,
   or anyone who finds the URL can create an account on your instance.

## Troubleshooting

- *"Tempo rejected the API token"* — it was revoked or expired. Create a new one.
- *"Could not reach Tempo"* — you are off the LAN, or the pod is down. Check
  `https://tempo.local.playquota.com/api/healthz`.
- Tools appear but every call fails — `TEMPO_TOKEN` is probably unset; the server
  exits at start with a message on stderr when it is missing.
