# Mac mini 公司安裝完整手冊

呢份文件係畀你之後返公司逐部 Mac mini 安裝用。目標係：

- 每條 team 一部 Mac mini 長開
- Agent / Head / Admin 用手機、MacBook、iPad 開網址登入
- App、Postgres database、提醒 worker、文件 storage 都喺 Mac mini / Docker 入面跑
- AI 快速輸入用本地 Ollama
- 語音輸入可選擇用本地 Whisper
- 手機測試先用 trycloudflare；正式用 Cloudflare named tunnel + 真 domain

---

## 0. 先理解架構

每部 Mac mini 會做呢幾件事：

```text
Mac mini
  Docker Desktop
    Postgres database
    InsuranceAI app
    reminders worker
    backup worker
    optional cloudflared named tunnel

  Host machine
    Ollama at http://localhost:11434
    Whisper at http://127.0.0.1:9000
```

Agent 手機 / MacBook 唔使裝 app，只要開網址：

```text
https://team-a.yourdomain.com
```

測試階段可以用：

```text
https://xxxxx.trycloudflare.com
```

---

## 1. 新 Mac mini 準備

### 1.1 更新 macOS

先喺 System Settings 入面更新 macOS。Apple Silicon Mac mini 會比較適合跑 Ollama / Whisper。

### 1.2 安裝 Docker Desktop

去 Docker 官方下載：

```text
https://www.docker.com/products/docker-desktop/
```

安裝後打開 Docker Desktop，等右上角顯示 Docker 已經 running。

Terminal 測試：

```bash
docker --version
docker compose version
```

見到版本號就 OK。

### 1.3 安裝 Homebrew

如果未有 Homebrew，Terminal 貼：

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Apple Silicon Mac 通常再貼：

```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
```

測試：

```bash
brew --version
```

---

## 2. 下載 app repo

### 2.1 如果 repo 係 public

```bash
cd ~/Documents
git clone https://github.com/BOOK318/insurance-agent-web.git
cd insurance-agent-web
```

### 2.2 如果 repo 係 private

GitHub private repo 需要 token，唔可以用 GitHub password。

GitHub token 至少要有：

```text
repo
read:packages
```

clone：

```bash
cd ~/Documents
git clone https://github.com/BOOK318/insurance-agent-web.git
cd insurance-agent-web
```

Username：

```text
BOOK318
```

Password：

```text
貼 GitHub token
```

### 2.3 如果 Git clone 搞唔掂

可以喺 GitHub 網頁：

```text
Code -> Download ZIP
```

解壓後放去：

```text
~/Documents/insurance-agent-web
```

但公司正式安裝，建議用 git clone，之後更新會簡單好多。

---

## 3. 建立 `.env`

入 repo folder：

```bash
cd ~/Documents/insurance-agent-web
```

複製 example：

```bash
cp .env.deploy.example .env
```

或者直接開：

```bash
nano .env
```

### 3.1 產生安全密碼

非常重要：`DB_PASSWORD` 唔好用 base64，因為 base64 可能有 `/`、`=`，會整壞 database URL。

用 hex：

```bash
openssl rand -hex 24
```

第一次結果放入：

```env
DB_PASSWORD=
```

再打多次：

```bash
openssl rand -hex 32
```

第二次結果放入：

```env
JWT_SECRET=
```

### 3.2 `.env` 範本

將 `.env` 改成類似咁：

```env
APP_IMAGE=ghcr.io/book318/insurance-agent-web:latest

DB_PASSWORD=PASTE_HEX_DB_PASSWORD_HERE
JWT_SECRET=PASTE_HEX_JWT_SECRET_HERE

ANTHROPIC_API_KEY=sk-ant-xxxxx

CLOUDFLARE_TUNNEL_TOKEN=
TUNNEL_DOMAIN=

APP_PORT=3000
DB_PORT=5432

OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_VISION_MODEL=qwen2.5vl:7b

WHISPER_URL=http://host.docker.internal:9000/inference
TRANSCRIBE_MAX_BYTES=26214400

NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@team.local

BACKUP_HOST_DIR=./backups
BACKUP_RETENTION_DAYS=30
BACKUP_NOTIFY_URL=
TZ=Asia/Hong_Kong

SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
```

儲存 nano：

```text
Control + O
Enter
Control + X
```

### 3.3 檢查 `.env`

```bash
grep '^DB_PASSWORD=' .env
grep '^JWT_SECRET=' .env
```

`DB_PASSWORD` 應該只得 `0-9` 同 `a-f`，唔應該有 `/` 或 `=`。

---

## 4. GitHub Docker image 權限

### 4.1 如果 GHCR package 係 public

可以直接 pull：

```bash
docker pull ghcr.io/book318/insurance-agent-web:latest
```

### 4.2 如果 GHCR package 係 private

要先用 GitHub token login：

```bash
echo "PASTE_GITHUB_TOKEN_HERE" | docker login ghcr.io -u BOOK318 --password-stdin
```

成功會見到：

```text
Login Succeeded
```

再 pull：

```bash
docker pull ghcr.io/book318/insurance-agent-web:latest
```

---

## 5. 第一次啟動 App

確保你喺 repo folder：

```bash
cd ~/Documents/insurance-agent-web
```

檢查最少有：

```bash
ls -la
```

你要見到：

```text
.env
docker-compose.prod.yml
schema.sql
scripts/
```

先檢查 compose：

```bash
docker compose -f docker-compose.prod.yml config
```

如果冇 error，啟動：

```bash
docker compose -f docker-compose.prod.yml up -d
```

檢查：

```bash
docker compose -f docker-compose.prod.yml ps
```

正常會見到 `db`、`app`、`worker` 等等係 `Up`。

如果 backup build 有問題，先開核心服務：

```bash
docker compose -f docker-compose.prod.yml up -d db migrate app worker
```

---

## 6. 第一次登入

開：

```bash
open http://localhost:3000
```

注意：Docker production cookie 係 `Secure`，所以 `http://localhost` 可能登入 API 成功但 browser 唔 keep cookie。正式 / 推薦用 HTTPS。

先測 API：

```bash
curl -i http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@team.local","password":"Admin@1234"}'
```

如果見到 `HTTP/1.1 200 OK`，代表 account/password 正常。

預設 admin：

```text
Email: admin@team.local
Password: Admin@1234
```

Agent / Head 由 admin 登入後去：

```text
/admin/users
```

新增。

---

## 7. 用 trycloudflare 做手機 HTTPS 測試

因為 login cookie production 需要 HTTPS，所以測試手機時用 trycloudflare 最方便。

安裝 cloudflared：

```bash
brew install cloudflared
```

如果 `brew` command not found：

```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
brew install cloudflared
```

開 tunnel：

```bash
cloudflared tunnel --url http://localhost:3000
```

Terminal 會出：

```text
https://xxxxx.trycloudflare.com
```

用手機 / Safari 開呢條。呢個係 HTTPS，登入 cookie 會 work。

注意：

- Terminal 唔好關
- Mac mini 唔好 sleep
- 每次重開 trycloudflare，網址可能變

---

## 8. 正式 domain + Cloudflare Named Tunnel

正式公司用，建議每條 team 一條 subdomain：

```text
team-a.yourdomain.com
team-b.yourdomain.com
team-c.yourdomain.com
```

Cloudflare 步驟：

1. 買 / 使用一個 domain
2. 將 domain 加入 Cloudflare
3. 去 Cloudflare Zero Trust
4. `Networks -> Tunnels`
5. `Create a tunnel`
6. 選 `Cloudflared`
7. 名稱例如 `team-a-mac-mini`
8. 選 Docker install method
9. 複製 token
10. Public hostname 設：

```text
team-a.yourdomain.com
```

Service 指去：

```text
http://app:3000
```

`.env` 填：

```env
CLOUDFLARE_TUNNEL_TOKEN=PASTE_TUNNEL_TOKEN_HERE
TUNNEL_DOMAIN=team-a.yourdomain.com
```

重開：

```bash
docker compose -f docker-compose.prod.yml up -d cloudflared app
```

之後正式網址：

```text
https://team-a.yourdomain.com
```

---

## 9. 安裝 Ollama

Ollama 用嚟做本地 AI extraction / OCR 前處理。

官方下載：

```text
https://ollama.com/download/mac
```

或者用 Homebrew：

```bash
brew install ollama
```

開 Ollama app，或者 Terminal：

```bash
ollama serve
```

下載模型：

```bash
ollama pull qwen2.5:7b
ollama pull qwen2.5vl:7b
```

測試：

```bash
curl http://localhost:11434/api/tags
```

見到 model list 就 OK。

`.env` 應該係：

```env
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_VISION_MODEL=qwen2.5vl:7b
```

---

## 10. 安裝本地 Whisper

Whisper 用嚟將錄音轉文字。流程係：

```text
手機 / browser 錄音
  -> /api/transcribe
  -> Mac mini 本地 whisper-server
  -> 回傳文字
```

### 10.1 安裝 build tools

```bash
brew install git cmake ffmpeg
```

### 10.2 下載 whisper.cpp

```bash
cd ~
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
```

### 10.3 Build

```bash
cmake -B build
cmake --build build -j --config Release
```

### 10.4 下載 model

MacBook Air / Mac mini 先用 small：

```bash
sh ./models/download-ggml-model.sh small
```

想準一點可以用 medium：

```bash
sh ./models/download-ggml-model.sh medium
```

### 10.5 開 Whisper server

```bash
cd ~/whisper.cpp
./build/bin/whisper-server \
  -m models/ggml-small.bin \
  --host 127.0.0.1 \
  --port 9000 \
  --language zh
```

呢個 Terminal 唔好關。

### 10.6 測試 Whisper

開另一個 Terminal：

```bash
curl http://127.0.0.1:9000/inference \
  -F file=@~/whisper.cpp/samples/jfk.wav \
  -F response_format=json
```

有 JSON 回應就 OK。

`.env` 應該係：

```env
WHISPER_URL=http://host.docker.internal:9000/inference
TRANSCRIBE_MAX_BYTES=26214400
```

如果 app 入面語音話「本地 Whisper 未啟動」，檢查：

- Whisper Terminal 仲開住
- Port 係 9000
- `.env` 有 `WHISPER_URL=http://host.docker.internal:9000/inference`
- Docker app 有重開

---

## 11. Push notification / VAPID

VAPID 係 Web Push 用嘅 public/private key pair。

產生：

```bash
docker run --rm node:20-alpine sh -c "npx -y web-push generate-vapid-keys --json"
```

會出：

```json
{
  "publicKey": "...",
  "privateKey": "..."
}
```

放入 `.env`：

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=PASTE_PUBLIC_KEY
VAPID_PRIVATE_KEY=PASTE_PRIVATE_KEY
VAPID_SUBJECT=mailto:admin@team.local
```

重開 app：

```bash
docker compose -f docker-compose.prod.yml up -d app worker
```

Agent 登入後去：

```text
/settings
```

開啟通知，再 send test。

---

## 12. 建立 Agent / Head account

用 admin 登入後：

```text
/admin/users
```

可以新增：

```text
agent@team.local / Agent@1234
head@team.local / Head@1234
```

正式公司建議：

- 每個 agent 用自己 email
- 初始密碼最少 8 字
- 離職就 disable account
- 唔好共用 admin account

---

## 13. 日常更新

當 GitHub Actions build 完新版 Docker image：

```bash
cd ~/Documents/insurance-agent-web
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

如果有 Watchtower，佢會定期自己 pull 新 image。

手動睇 logs：

```bash
docker compose -f docker-compose.prod.yml logs --tail=120 app
```

---

## 14. 備份

Production compose 有 backup service，會備份：

- Postgres database
- uploaded documents

備份位置：

```env
BACKUP_HOST_DIR=./backups
```

手動備份：

```bash
docker compose -f docker-compose.prod.yml exec backup /usr/local/bin/backup.sh
```

公司正式用，建議將 `BACKUP_HOST_DIR` 指去：

- NAS mount
- 外置加密硬碟
- 之後再加 restic / GPG 加密

---

## 15. 常見錯誤

### 15.1 `TypeError: Invalid URL`

通常係 `DB_PASSWORD` 有 `/` 或 `=`。

修法：

```bash
openssl rand -hex 24
nano .env
```

換成只得 hex 嘅 `DB_PASSWORD`。

如果係新機未有資料，可以清 DB：

```bash
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d
```

### 15.2 `relation "clients" does not exist`

代表 database 未食到 `schema.sql`。

檢查：

```bash
ls -la schema.sql
```

如果有 `schema.sql`，但之前已經開過空 database，要重置：

```bash
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d
```

### 15.3 登入 API 200，但 browser 卡住 login

原因通常係 production cookie 有 `Secure`，HTTP localhost 唔保存 cookie。

用 HTTPS：

```bash
cloudflared tunnel --url http://localhost:3000
```

然後用 `https://xxxxx.trycloudflare.com/login`。

正式用 domain + Cloudflare named tunnel。

### 15.4 `cloudflared: command not found`

```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
brew install cloudflared
```

### 15.5 `brew: command not found`

```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
```

如果 work：

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
```

### 15.6 Docker image unauthorized

如果 GHCR private：

```bash
echo "PASTE_GITHUB_TOKEN" | docker login ghcr.io -u BOOK318 --password-stdin
docker pull ghcr.io/book318/insurance-agent-web:latest
```

### 15.7 Backup build failed

先開核心服務：

```bash
docker compose -f docker-compose.prod.yml up -d db migrate app worker
```

之後再修 backup。

---

## 16. Security checklist

正式交公司前做：

- Revoke 所有曾經貼過出去嘅 GitHub token / Claude key
- 每條 team 用不同 `DB_PASSWORD`
- 每條 team 用不同 `JWT_SECRET`
- Mac mini 開 FileVault
- Mac mini 設定唔好 sleep
- Admin account 改密碼
- Agent 離職即 disable
- `.env` 唔好放 GitHub
- `storage/`、`backups/` 唔好放 GitHub
- 正式用 HTTPS domain

---

## 17. 最短安裝流程

如果你已熟手，一部新 Mac mini 大概係：

```bash
# 1. Install Docker Desktop first, then:
cd ~/Documents
git clone https://github.com/BOOK318/insurance-agent-web.git
cd insurance-agent-web

# 2. Create env
cp .env.deploy.example .env
nano .env

# 3. Start
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps

# 4. Test HTTPS
cloudflared tunnel --url http://localhost:3000
```

Login:

```text
admin@team.local
Admin@1234
```

