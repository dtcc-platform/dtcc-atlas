# Local Deployment

This guide starts the local DTCC Atlas stack with `dtcc-sim` and `dtcc-agent`
as mini-services.

Services:

```text
dtcc-sim      http://localhost:8001  Simulation mini-service
dtcc-agent    http://localhost:8050  Lurkie chat mini-service
dtcc-atlas    http://localhost:8000  Atlas backend API
atlas UI      http://localhost:3000  Vite frontend
```

Expected checkout layout:

```text
/Users/vasnas/scratch/dtcc-atlas
/Users/vasnas/scratch/dtcc-sim
/Users/vasnas/scratch/dtcc-agent
```

## 1. Start Docker

Start Docker Desktop first, then verify Docker is available:

```bash
docker info >/dev/null && echo "Docker is running"
```

## 2. Start dtcc-sim

```bash
cd /Users/vasnas/scratch/dtcc-sim
mkdir -p data/shared-results
docker compose up -d --build
curl http://localhost:8001/api/v1/health
```

Expected health response includes:

```json
{"status":"ok"}
```

Follow logs if needed:

```bash
cd /Users/vasnas/scratch/dtcc-sim
docker compose logs -f
```

## 3. Authenticate Claude for dtcc-agent

On macOS, do not mount `~/.claude` into Docker for auth. Claude Code stores
the local OAuth credential in Keychain. Generate a container token on the host:

```bash
cd /Users/vasnas/scratch/dtcc-agent
claude setup-token
```

Copy only the generated `sk-ant-oat01-...` token into a local `token` file:

```bash
cd /Users/vasnas/scratch/dtcc-agent
printf '%s\n' 'sk-ant-oat01-PASTE-TOKEN-HERE' > token
chmod 600 token
```

Do not use command substitution such as
`export CLAUDE_CODE_OAUTH_TOKEN="$(claude setup-token)"`. The command is
interactive and may capture the whole Claude login screen, ANSI control codes,
and browser prompt into the environment variable. That produces invalid
`Authorization: Bearer ...` headers.

Confirm the variable is a single clean token without printing it:

```bash
cd /Users/vasnas/scratch/dtcc-agent
export CLAUDE_CODE_OAUTH_TOKEN="$(tr -d '\r\n' < token)"
python verify_auth.py --require-oauth
```

## 4. Start dtcc-agent

`dtcc-agent` runs inside Docker, so it reaches the host-published `dtcc-sim`
through `host.docker.internal`.

```bash
cd /Users/vasnas/scratch/dtcc-agent
mkdir -p data/agent
export DTCC_REMOTE_SERVICES=http://host.docker.internal:8001
export CLAUDE_CODE_OAUTH_TOKEN="$(tr -d '\r\n' < token)"
python verify_auth.py --require-oauth
docker compose up -d --build --force-recreate
curl http://localhost:8050/health
```

Expected health response includes:

```json
{"status":"ok"}
```

Confirm the token reached the container:

```bash
cd /Users/vasnas/scratch/dtcc-agent
docker compose exec -T dtcc-agent python verify_auth.py --require-oauth
```

Open Lurkie directly:

```text
http://localhost:8050
```

Follow logs if needed:

```bash
cd /Users/vasnas/scratch/dtcc-agent
docker compose logs -f dtcc-agent
```

## 5. Start Atlas

Atlas runs on the host, so it reaches `dtcc-sim` and `dtcc-agent` through
`localhost`.

```bash
cd /Users/vasnas/scratch/dtcc-atlas
export DTCC_REMOTE_SERVICES=http://localhost:8001
export DTCC_AGENT_SERVICE_URL=http://localhost:8050
./start_dev.sh
```

Open Atlas:

```text
http://localhost:3000
```

Atlas backend health/API root:

```text
http://localhost:8000
```

## One-Shot Startup

After Docker Desktop is running and `/Users/vasnas/scratch/dtcc-agent/token`
contains only the `sk-ant-oat01-...` token, this starts the full stack:

```bash
cd /Users/vasnas/scratch/dtcc-sim
mkdir -p data/shared-results
docker compose up -d --build
curl http://localhost:8001/api/v1/health

cd /Users/vasnas/scratch/dtcc-agent
mkdir -p data/agent
export DTCC_REMOTE_SERVICES=http://host.docker.internal:8001
export CLAUDE_CODE_OAUTH_TOKEN="$(tr -d '\r\n' < token)"
python verify_auth.py --require-oauth
docker compose up -d --build --force-recreate
docker compose exec -T dtcc-agent python verify_auth.py --require-oauth
curl http://localhost:8050/health

cd /Users/vasnas/scratch/dtcc-atlas
export DTCC_REMOTE_SERVICES=http://localhost:8001
export DTCC_AGENT_SERVICE_URL=http://localhost:8050
./start_dev.sh
```

## Shutdown

Stop Atlas with `Ctrl+C` in the terminal running `start_dev.sh`.

Stop the mini-services:

```bash
cd /Users/vasnas/scratch/dtcc-agent
docker compose down

cd /Users/vasnas/scratch/dtcc-sim
docker compose down
```

## Rebuild After Code Changes

Rebuild `dtcc-sim`:

```bash
cd /Users/vasnas/scratch/dtcc-sim
docker compose up -d --build
```

Rebuild `dtcc-agent`:

```bash
cd /Users/vasnas/scratch/dtcc-agent
export DTCC_REMOTE_SERVICES=http://host.docker.internal:8001
export CLAUDE_CODE_OAUTH_TOKEN="$(tr -d '\r\n' < token)"
python verify_auth.py --require-oauth
docker compose up -d --build --force-recreate
```

Restart Atlas after changing environment variables:

```bash
cd /Users/vasnas/scratch/dtcc-atlas
export DTCC_REMOTE_SERVICES=http://localhost:8001
export DTCC_AGENT_SERVICE_URL=http://localhost:8050
./start_dev.sh
```

## Troubleshooting

Check all running containers:

```bash
docker ps
```

Check `dtcc-sim` health:

```bash
curl http://localhost:8001/api/v1/health
```

Check `dtcc-agent` health:

```bash
curl http://localhost:8050/health
```

Check `dtcc-agent` auth inside Docker:

```bash
cd /Users/vasnas/scratch/dtcc-agent
docker compose exec -T dtcc-agent python verify_auth.py --require-oauth
```

Check `dtcc-agent` logs:

```bash
cd /Users/vasnas/scratch/dtcc-agent
docker compose logs -f dtcc-agent
```

Check `dtcc-sim` logs:

```bash
cd /Users/vasnas/scratch/dtcc-sim
docker compose logs -f
```

If Atlas chat reconnects repeatedly, verify:

```bash
curl http://localhost:8050/health
```

Then restart Atlas with:

```bash
cd /Users/vasnas/scratch/dtcc-atlas
export DTCC_REMOTE_SERVICES=http://localhost:8001
export DTCC_AGENT_SERVICE_URL=http://localhost:8050
./start_dev.sh
```

If Lurkie reports an invalid `Bearer` header, the Claude OAuth environment
variable is not a clean token. Clear it, generate a new token, save only the
single `sk-ant-oat01-...` value, and recreate `dtcc-agent`:

```bash
cd /Users/vasnas/scratch/dtcc-agent
unset CLAUDE_CODE_OAUTH_TOKEN
claude setup-token
printf '%s\n' 'sk-ant-oat01-PASTE-NEW-TOKEN-HERE' > token
chmod 600 token

export CLAUDE_CODE_OAUTH_TOKEN="$(tr -d '\r\n' < token)"
python verify_auth.py --require-oauth
docker compose up -d --build --force-recreate
docker compose exec -T dtcc-agent python verify_auth.py --require-oauth
```

If `dtcc-agent` cannot reach `dtcc-sim`, verify that `dtcc-agent` was started
with:

```bash
export DTCC_REMOTE_SERVICES=http://host.docker.internal:8001
```

If Atlas cannot discover simulations, verify Atlas was started with:

```bash
export DTCC_REMOTE_SERVICES=http://localhost:8001
```
