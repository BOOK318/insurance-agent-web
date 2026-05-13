# Codex Bootstrap Prompt for `insurance-agent-web`

Copy the prompt below into Codex on a new Mac when you want it to install,
run, and verify this project from GitHub.

---

## Prompt to give Codex

You are setting up my Hong Kong insurance agent CRM on this computer.

Repository:

```text
https://github.com/BOOK318/insurance-agent-web
```

Please clone the repo, read the setup docs, install the required local services,
start the app, verify it is runnable, and leave me with the local URL and any
external tunnel URL.

If I provide an `insurance-agent-data-*.tar.gz` package path or private download
URL, use the repo bootstrap script after clone:

```bash
scripts/codex-bootstrap.sh /path/to/insurance-agent-data-....tar.gz
```

or:

```bash
DATA_PACKAGE_URL="https://private-download-url/insurance-agent-data.tar.gz" \
  scripts/codex-bootstrap.sh
```

This is the preferred path because it restores the database knowledge backup
instead of re-reading all PDFs.

### 1. Clone and inspect

```bash
cd ~/Documents
git clone https://github.com/BOOK318/insurance-agent-web.git
cd insurance-agent-web
git status -sb
```

Read these files before changing anything:

```text
README.md
MAC-MINI-INSTALL-GUIDE.md
WHISPER-MAC-MINI.md
SETUP-GUIDE.md
docker-compose.yml
docker-compose.prod.yml
.env.example
.env.deploy.example
package.json
```

Understand the app first:

- Next.js 15 App Router CRM for insurance agents.
- PostgreSQL stores users, clients, policies, claims, reminders, documents,
  settings, push subscriptions, and audit/conversation records.
- Claude is used for final AI replies and policy extraction where needed.
- Ollama runs locally for intent detection, image/OCR preprocessing, and privacy
  filtering before anything goes to Claude.
- Whisper runs locally for voice transcription.
- Web Push uses VAPID keys and works best through HTTPS, especially on iPhone.
- BOC portal/product/process knowledge lives in PostgreSQL table
  `company_knowledge`; restore/import this data before testing `/ai`.

### 2. Install prerequisites on macOS

Install or verify:

```bash
xcode-select --install
```

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install git node@20 docker docker-compose cloudflared ollama cmake ffmpeg
```

Docker Desktop is acceptable instead of Homebrew Docker. If Docker Desktop is
used, open it once and confirm Docker is running:

```bash
docker info
```

### 3. Create environment file

For a local source build:

```bash
cp .env.example .env
```

For a Mac mini / deployed team machine:

```bash
cp .env.deploy.example .env
```

Generate secrets:

```bash
openssl rand -hex 24
openssl rand -hex 32
```

Generate Web Push VAPID keys:

```bash
docker run --rm node:20-alpine sh -c "npx -y web-push generate-vapid-keys --json"
```

Fill `.env` with real values:

```env
DB_PASSWORD=<strong random database password>
JWT_SECRET=<32+ char random JWT secret>
ANTHROPIC_API_KEY=<my Anthropic API key>

# If using a real Cloudflare tunnel:
CLOUDFLARE_TUNNEL_TOKEN=<Cloudflare tunnel token>
TUNNEL_DOMAIN=<team domain, for example team-a.example.com>

# If testing locally only:
TUNNEL_DOMAIN=localhost:3000

# Local Ollama on the Mac host, outside Docker:
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_VISION_MODEL=qwen2.5vl:7b

# Local Whisper on the Mac host, outside Docker:
WHISPER_URL=http://host.docker.internal:9000/inference
TRANSCRIBE_MAX_BYTES=26214400

# Web Push:
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<generated publicKey>
VAPID_PRIVATE_KEY=<generated privateKey>
VAPID_SUBJECT=mailto:admin@team.local
```

Do not commit `.env`.

### 4. Install and start Ollama

Ollama is required for local extraction/OCR preprocessing.

Start Ollama:

```bash
ollama serve
```

If `ollama serve` says Ollama is already running, that is fine.

Pull the current 7B models:

```bash
ollama pull qwen2.5:7b
ollama pull qwen2.5vl:7b
```

Verify:

```bash
curl http://localhost:11434/api/tags
```

Expected environment values for Docker:

```env
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_VISION_MODEL=qwen2.5vl:7b
```

### 5. Install and start local Whisper

Whisper is required for local voice input. Use `whisper.cpp`.

```bash
cd ~
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
cmake -B build
cmake --build build -j --config Release
```

Download a model. Start with `small` if the Mac is weaker; use `medium` for
better Cantonese accuracy:

```bash
sh ./models/download-ggml-model.sh small
# optional better model:
sh ./models/download-ggml-model.sh medium
```

Run the Whisper HTTP server:

```bash
cd ~/whisper.cpp
./build/bin/whisper-server \
  -m models/ggml-small.bin \
  --host 127.0.0.1 \
  --port 9000 \
  --language zh
```

If you downloaded `medium`, use:

```bash
./build/bin/whisper-server \
  -m models/ggml-medium.bin \
  --host 127.0.0.1 \
  --port 9000 \
  --language zh
```

Verify Whisper:

```bash
curl http://127.0.0.1:9000/inference \
  -F file=@~/whisper.cpp/samples/jfk.wav \
  -F response_format=json
```

Important implementation detail:

- The web app records WAV audio now.
- `/api/transcribe` only accepts WAV MIME types.
- Voice input is sent to local `whisper-server`, not Google, Claude, or
  Anthropic.
- Docker should use `WHISPER_URL=http://host.docker.internal:9000/inference`.
- Local Next dev can use `WHISPER_URL=http://127.0.0.1:9000/inference`.

### 6. Run the app with Docker

For source/local Docker build:

```bash
cd ~/Documents/insurance-agent-web
docker compose --env-file .env up -d --build db app
```

Run migrations if needed:

```bash
docker compose --env-file .env exec app npx node-pg-migrate -d DATABASE_URL up
```

For production image / Mac mini deployment, use:

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d db migrate app worker
```

If using a Cloudflare named tunnel:

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d cloudflared
```

If using a temporary TryCloudflare URL for testing:

```bash
cloudflared tunnel --url http://localhost:3000
```

Open:

```text
http://localhost:3000
```

### 6.1 Restore or import knowledge data

The AI assistant retrieves BOC/product/process information from
`company_knowledge`. The local model does not permanently learn this by itself.

If I provide a `db-*.sql.gz` backup, restore it on the fresh machine before
final verification:

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d db
docker compose --env-file .env -f docker-compose.prod.yml exec -T db \
  psql -U admin -d insurance \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
gunzip -c backups/db-YYYY-MM-DDTHH-MM-SSZ.sql.gz | \
  docker compose --env-file .env -f docker-compose.prod.yml exec -T db \
  psql -U admin -d insurance
docker compose --env-file .env -f docker-compose.prod.yml up -d migrate app worker backup
```

If there is no DB backup but `knowledge-base` files exist, import them:

```bash
npm install
DATABASE_URL="postgres://admin:<DB_PASSWORD>@127.0.0.1:5432/insurance" \
  node scripts/import-boc-portal-knowledge.mjs
DATABASE_URL="postgres://admin:<DB_PASSWORD>@127.0.0.1:5432/insurance" \
  node scripts/import-boc-pdf-text.mjs
```

Verify:

```bash
docker compose --env-file .env -f docker-compose.prod.yml exec db \
  psql -U admin -d insurance \
  -c "SELECT COUNT(*) FROM company_knowledge WHERE is_active = TRUE;"
```

Default local login:

```text
Admin: admin@team.local / Admin@1234
Agent: agent@team.local / Agent@1234
```

If the agent account is missing, create it from the admin users page.

### 7. Verify the important features

Run basic checks:

```bash
curl -I http://localhost:3000
curl http://localhost:3000/api/push/public-key
curl http://localhost:11434/api/tags
curl http://127.0.0.1:9000/inference \
  -F file=@~/whisper.cpp/samples/jfk.wav \
  -F response_format=json
```

Build and test from the repo when dependencies are installed locally:

```bash
npm install
npm run build
TEST_BASE_URL=http://localhost:3000 npm run test:e2e
```

Manual browser checks:

- `/login` works.
- `/` loads the agent dashboard.
- Top-right settings button goes to `/settings`.
- `/settings` shows VAPID key status and can send a test push after subscription.
- `/ai` can type a message and attach images/documents.
- `/ai` voice input records and calls `/api/transcribe`.
- `/clients/new` voice input records and calls `/api/transcribe`.
- `/policies/new` can import a text PDF; scanned PDFs use local Ollama Vision.
- `/search` has a back button and returns results from dashboard search.
- `/reminders` loads and worker can send due push notifications.

### 8. Web Push / iPhone Safari notes

For real phone notification behavior:

- Must use HTTPS, not plain `http://localhost`.
- Use Cloudflare Tunnel or another HTTPS domain.
- iPhone Safari Web Push requires iOS 16.4+.
- On iPhone, install the site to Home Screen first; normal Safari tabs cannot
  receive Web Push like a native app.
- VAPID keys must be set:
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- After changing VAPID/env values, rebuild or restart the app container.

### 9. AI and PDF size limits to know

AI assistant page (`/ai`):

- PDF/text document upload is capped at `12,000` characters in
  `app/(agent)/ai/page.tsx`.
- The frontend reads PDF text with `pdfjs-dist`, stops once accumulated text is
  over 12,000 characters, and appends a note that only the first 12,000
  characters were read.
- If the PDF is scanned and has no embedded text, `/ai` asks the user to upload
  screenshots/photos instead.

Policy import page (`/policies/new`):

- This is separate from `/ai`.
- Text PDF extraction is capped at `220,000` characters.
- Scanned policy PDFs render up to the first 6 pages for local Ollama Vision OCR.
- Server-side policy parsing also caps text at `220,000` characters before
  sending sanitized/chunked text to Claude.

### 10. Privacy and model routing

Keep this behavior unless I explicitly ask to change it:

- Voice: browser WAV recording -> `/api/transcribe` -> local Whisper.
- Image/OCR preprocessing: local Ollama Vision model `qwen2.5vl:7b`.
- Intent/extraction preprocessing: local Ollama text model `qwen2.5:7b`.
- Claude model currently used for final AI response / parsing:
  `claude-haiku-4-5`.
- PII should be tokenized or scrubbed before Claude wherever the existing code
  already does that.

### 11. What to report back

When finished, report:

- Current git branch and commit.
- Whether Docker app is running.
- Local URL and external HTTPS/tunnel URL if available.
- Whether Ollama is running and both 7B models are installed.
- Whether Whisper is running and which model is loaded (`small` or `medium`).
- Whether `company_knowledge` has active rows and `/ai` can answer a BOC
  knowledge question.
- Whether VAPID public key is visible from `/api/push/public-key`.
- Any failing command and the exact reason.

Do not claim success unless you have run the verification commands and read the
output.
