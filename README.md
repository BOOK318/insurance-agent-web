# Insurance Agent Web

This repo is a Hong Kong insurance agent CRM with an AI assistant. It is meant
to be installed on a team Mac mini, then accessed by agents through a browser.

Codex should read this file first when setting up a new computer.

## What This App Runs

On the Mac mini:

- Docker runs PostgreSQL, the web app, reminder worker, backup worker, and
  optional Cloudflare named tunnel.
- Ollama runs on the Mac host for local text/image preprocessing.
- Whisper runs on the Mac host for local voice transcription.
- Claude is used for final AI responses where the current app requires it.
- BOC portal knowledge is stored in PostgreSQL table `company_knowledge`.

Important: the local model does not permanently "learn" the BOC documents by
itself. The reliable install path is to restore/import the knowledge database,
then the AI retrieves relevant rows when an agent asks a question.

AI flow:

```text
Agent question
  -> /api/ai
  -> lib/knowledge.ts searches company_knowledge
  -> relevant BOC/product/process context is added to the AI prompt
  -> model returns the answer
```

## New Machine Goal

After cloning this repo on a new Mac mini, Codex should leave the machine with:

- Docker Desktop installed and running.
- The app running at `http://localhost:3000`.
- HTTPS access through either Cloudflare named tunnel or temporary
  TryCloudflare.
- Ollama running with the configured text and vision models.
- Whisper running at `http://127.0.0.1:9000/inference`.
- PostgreSQL restored or seeded with the team knowledge database.
- `/ai` able to answer from BOC/product/process knowledge.
- Backups writing to `BACKUP_HOST_DIR`.

## Fast Codex Bootstrap

For a new Mac, the shortest intended flow is:

```text
1. Install Docker Desktop and open it once.
2. Put the latest insurance-agent-data-*.tar.gz package on the Mac.
3. Give Codex this GitHub repo URL.
4. Ask Codex to clone the repo and run scripts/codex-bootstrap.sh with the data package.
```

Example after clone:

```bash
cd ~/Documents/insurance-agent-web
scripts/codex-bootstrap.sh /path/to/insurance-agent-data-2026-05-13T08-06-38Z.tar.gz
```

If the data package is available through a private direct download URL:

```bash
cd ~/Documents/insurance-agent-web
DATA_PACKAGE_URL="https://private-download-url/insurance-agent-data.tar.gz" \
  scripts/codex-bootstrap.sh
```

The bootstrap script will:

- create `.env` if missing;
- build or pull the app image;
- start PostgreSQL;
- restore `db-*.sql.gz` from the package;
- restore uploaded documents if present;
- mark existing migrations correctly;
- start app, worker, and backup services;
- open a temporary TryCloudflare URL;
- verify app HTTP, database, and knowledge row count.

Docker Desktop itself still needs to be installed/opened by the Mac user first,
because macOS requires user/admin approval for the first install.

## Files To Read Before Installing

Read these in order:

```text
README.md
CODEX-PROMPT.md
MAC-MINI-INSTALL-GUIDE.md
WHISPER-MAC-MINI.md
.env.deploy.example
docker-compose.prod.yml
scripts/backup.sh
scripts/codex-bootstrap.sh
scripts/import-boc-portal-knowledge.mjs
scripts/import-boc-pdf-text.mjs
```

`CODEX-PROMPT.md` is the prompt to paste into Codex before the repo is cloned.
This `README.md` is the repo-local source of truth after clone.

## Required Inputs From The Owner

Codex can install software and start services, but these values must come from
the owner or deployment operator:

- `ANTHROPIC_API_KEY`
- `DB_PASSWORD`
- `JWT_SECRET`
- Web Push VAPID public/private keys
- Cloudflare tunnel token and domain, if using a permanent team URL
- GitHub package read token, if `APP_IMAGE` is private
- Latest `db-*.sql.gz` backup, if restoring an existing knowledge/client DB
- Latest `docs-*.tar.gz` backup, if restoring uploaded documents

Do not commit `.env`, backups, private keys, client data, or downloaded portal
exports.

## Where Data Should Live

Keep these separate:

- GitHub stores app code, setup docs, migrations, and safe sample data.
- Docker image stores the built app only.
- PostgreSQL stores live team data and `company_knowledge`.
- `knowledge-base/boc-portal*.json` and `knowledge-base/raw-pdfs/boc-portal/`
  are internal source data for importing knowledge; keep them out of public
  GitHub.
- `deployment-data/*.tar.gz` is the handoff package for a new machine.

For each new team machine, use one of these paths:

- Best path: restore `backups/db-*.sql.gz`, because it contains the ready-to-use
  `company_knowledge` rows.
- Fallback path: extract a `deployment-data/insurance-agent-data-*.tar.gz`
  package, then run the import scripts to rebuild `company_knowledge`.

Create a handoff package on the source machine:

```bash
scripts/package-deployment-data.sh
```

The output stays under `deployment-data/`. Move that archive through encrypted
storage, private NAS, or another private channel. Do not upload it to public
GitHub.

Google Drive is fine as that private channel if access is restricted. Prefer
uploading one `insurance-agent-data-*.tar.gz` package instead of 979 loose PDF
files. On a new Mac, download that package first or provide Codex a private
direct download URL, then run `scripts/codex-bootstrap.sh`.

## Install Checklist For Codex

### 1. Clone

```bash
cd ~/Documents
git clone https://github.com/BOOK318/insurance-agent-web.git
cd insurance-agent-web
git status -sb
```

### 2. Install Prerequisites

Install Docker Desktop for Mac and open it once. Then verify:

```bash
docker info
docker compose version
```

Install command line tools:

```bash
xcode-select --install
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install git node@20 cloudflared ollama cmake ffmpeg
```

### 3. Create `.env`

For team/Mac mini deployment:

```bash
cp .env.deploy.example .env
```

Generate secrets:

```bash
openssl rand -hex 24
openssl rand -hex 32
docker run --rm node:20-alpine sh -c "npx -y web-push generate-vapid-keys --json"
```

Fill `.env`. Minimum expected values:

```env
APP_IMAGE=ghcr.io/book318/insurance-agent-web:latest
DB_PASSWORD=<strong_hex_password>
JWT_SECRET=<random_32_char_or_longer_secret>
ANTHROPIC_API_KEY=<anthropic_key>

APP_PORT=3000
DB_PORT=5432

OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_EXTRACT_MODEL=qwen2.5:0.5b
OLLAMA_VISION_MODEL=qwen2.5vl:7b

WHISPER_URL=http://host.docker.internal:9000/inference
TRANSCRIBE_MAX_BYTES=26214400

NEXT_PUBLIC_VAPID_PUBLIC_KEY=<vapid_public_key>
VAPID_PRIVATE_KEY=<vapid_private_key>
VAPID_SUBJECT=mailto:admin@team.local

BACKUP_HOST_DIR=./backups
BACKUP_RETENTION_DAYS=30
TZ=Asia/Hong_Kong
```

For a permanent HTTPS URL, also fill:

```env
CLOUDFLARE_TUNNEL_TOKEN=<team_cloudflare_tunnel_token>
TUNNEL_DOMAIN=<team-domain.example.com>
```

For temporary local testing only:

```env
TUNNEL_DOMAIN=localhost:3000
CLOUDFLARE_TUNNEL_TOKEN=
```

If `APP_IMAGE` is private on GitHub Container Registry, log in before starting
Docker Compose:

```bash
echo "$GHCR_READ_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
```

### 4. Start Ollama

```bash
ollama serve
```

If Ollama is already running, continue. Pull models:

```bash
ollama pull qwen2.5:0.5b
ollama pull qwen2.5:7b
ollama pull qwen2.5vl:7b
curl http://localhost:11434/api/tags
```

### 5. Start Whisper

```bash
cd ~
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
cmake -B build
cmake --build build -j --config Release
sh ./models/download-ggml-model.sh small
./build/bin/whisper-server \
  -m models/ggml-small.bin \
  --host 127.0.0.1 \
  --port 9000 \
  --language zh
```

For better Cantonese accuracy on a stronger Mac, use `medium` instead:

```bash
sh ./models/download-ggml-model.sh medium
./build/bin/whisper-server \
  -m models/ggml-medium.bin \
  --host 127.0.0.1 \
  --port 9000 \
  --language zh
```

Verify:

```bash
curl http://127.0.0.1:9000/inference \
  -F file=@~/whisper.cpp/samples/jfk.wav \
  -F response_format=json
```

### 6. Start App

Production image path:

```bash
cd ~/Documents/insurance-agent-web
docker compose --env-file .env -f docker-compose.prod.yml up -d db migrate app worker backup
```

Source build fallback:

```bash
docker compose --env-file .env up -d --build db app
```

Check:

```bash
docker compose --env-file .env -f docker-compose.prod.yml ps
curl -I http://localhost:3000
```

### 7. Restore Existing Database Backup

Use this only on a fresh/new machine or after confirming the target DB can be
replaced.

Put the latest backup under `./backups`, then start only the database:

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d db
```

Clear the empty initialized schema and restore the backup:

```bash
docker compose --env-file .env -f docker-compose.prod.yml exec -T db \
  psql -U admin -d insurance \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

gunzip -c backups/db-YYYY-MM-DDTHH-MM-SSZ.sql.gz | \
  docker compose --env-file .env -f docker-compose.prod.yml exec -T db \
  psql -U admin -d insurance
```

Then start the full app:

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d migrate app worker backup
```

Verify knowledge rows:

```bash
docker compose --env-file .env -f docker-compose.prod.yml exec db \
  psql -U admin -d insurance \
  -c "SELECT company, category, COUNT(*) FROM company_knowledge GROUP BY company, category ORDER BY company, category;"
```

### 8. Restore Uploaded Documents Backup

If there is a `docs-*.tar.gz` backup, restore it into the Docker documents
volume:

```bash
docker run --rm \
  -v insurance-agent-web_documents:/storage \
  -v "$PWD/backups:/backups" \
  alpine sh -c 'rm -rf /storage/documents && tar -xzf /backups/docs-YYYY-MM-DDTHH-MM-SSZ.tar.gz -C /storage'
```

### 9. Import BOC Knowledge From Repo Files

If there is no DB backup but the repo has `knowledge-base` files, import those
into `company_knowledge` after the DB is running.

If the files are in a deployment data package, extract it at the repo root
first:

```bash
tar -xzf deployment-data/insurance-agent-data-YYYY-MM-DDTHH-MM-SSZ.tar.gz
```

Install local Node dependencies:

```bash
npm install
```

For a Docker database exposed on localhost:

```bash
DATABASE_URL="postgres://admin:${DB_PASSWORD}@127.0.0.1:5432/insurance" \
  node scripts/import-boc-portal-knowledge.mjs

DATABASE_URL="postgres://admin:${DB_PASSWORD}@127.0.0.1:5432/insurance" \
  node scripts/import-boc-pdf-text.mjs
```

If the shell does not have `DB_PASSWORD`, load it from `.env` manually or run
the same commands with the actual password.

### 10. Start HTTPS Access

Permanent Cloudflare named tunnel:

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d cloudflared
```

Temporary TryCloudflare test URL:

```bash
cloudflared tunnel --url http://localhost:3000
```

Use the printed `https://xxxxx.trycloudflare.com` URL for phone testing.

## Final Verification

Do not report success until these checks pass or the exact blocker is known:

```bash
docker compose --env-file .env -f docker-compose.prod.yml ps
curl -I http://localhost:3000
curl http://localhost:3000/api/push/public-key
curl http://localhost:11434/api/tags
curl http://127.0.0.1:9000/inference \
  -F file=@~/whisper.cpp/samples/jfk.wav \
  -F response_format=json
docker compose --env-file .env -f docker-compose.prod.yml exec db \
  psql -U admin -d insurance \
  -c "SELECT COUNT(*) FROM company_knowledge WHERE is_active = TRUE;"
```

Manual browser checks:

- `/login` accepts the expected admin/agent user.
- `/` opens the agent portal after login.
- `/ai` can answer a BOC/product/process question from imported knowledge.
- Voice input reaches local Whisper.
- Policy PDF import can read text PDFs; scanned PDFs use local Ollama Vision.
- Backup can run manually:

```bash
docker compose --env-file .env -f docker-compose.prod.yml exec backup /usr/local/bin/backup.sh
```

## Default Local Login

For a fresh seed install:

```text
Admin: admin@team.local / Admin@1234
Agent: agent@team.local / Agent@1234
```

If a restored backup is used, login accounts come from that backup instead.

## Operational Notes

- `scripts/backup.sh` writes `db-*.sql.gz` and `docs-*.tar.gz` into
  `BACKUP_HOST_DIR`.
- Backups are plaintext. Store them on FileVault, encrypted external drive,
  NAS with encryption, or encrypt with GPG/restic before sending elsewhere.
- The production app uses secure cookies. For phone/login testing, use HTTPS
  through Cloudflare instead of plain LAN HTTP.
- If login appears successful but stays on the login page, check whether the
  browser is using HTTPS and whether `NEXT_PUBLIC_APP_URL`/`TUNNEL_DOMAIN` are
  correct.
- If Docker image pull is unauthorized, verify `GHCR_USER`,
  `GHCR_READ_TOKEN`, and whether the package is private.
- If AI answers without BOC details, first check `company_knowledge` row count;
  then check that `/api/ai` is running with the restored database.
