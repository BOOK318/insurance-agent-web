# Mac mini Team 部署流程

呢份文件係畀每條 team 一部 Mac mini 用。目標係：

1. GitHub Actions 自動 build Docker image
2. Image 推去 GitHub Container Registry（GHCR）
3. Mac mini 只需要 pull image 同啟動 Docker Compose
4. 之後有新版本，watchtower 會定時拉新 image

---

## 1. GitHub 第一次設定

### 建立 repo

將呢個 project 放入 private GitHub repo，例如：

```text
github.com/your-company/insurance-agent-web
```

GitHub Actions 會用：

```text
.github/workflows/docker-image.yml
```

自動 build：

```text
ghcr.io/your-company/insurance-agent-web:latest
```

### 開啟 Actions 權限

Repo 入面去：

```text
Settings -> Actions -> General
```

確認 Actions 可以 run。

再去：

```text
Settings -> Actions -> General -> Workflow permissions
```

選：

```text
Read and write permissions
```

咁 `GITHUB_TOKEN` 先可以 push Docker image 去 GHCR。

---

## 2. 推第一個 image

喺開發機：

```bash
git add .
git commit -m "Add Docker image deployment"
git push origin main
```

GitHub 會自動 build multi-arch image：

- `linux/arm64`：Apple Silicon Mac mini
- `linux/amd64`：Intel Mac / server

去 GitHub repo：

```text
Actions -> Build Docker Image
```

見到綠色剔，即係 image 已經出咗。

---

## 3. 每部 Mac mini 第一次安裝

### 安裝 Docker Desktop

先安裝 Docker Desktop for Mac，打開一次，等 Docker 完全啟動。

### 下載部署檔

```bash
mkdir -p ~/insurance-agent-web
cd ~/insurance-agent-web
```

如果 Mac mini 有 repo 權限，建議直接 clone：

```bash
git clone https://github.com/your-company/insurance-agent-web.git .
```

如果唔想 clone 成個 repo，至少要下載：

- `docker-compose.prod.yml`
- `.env.deploy.example`
- `schema.sql`

### 建立 `.env`

```bash
cp .env.deploy.example .env
nano .env
```

每條 team 改自己嘅設定：

```env
APP_IMAGE=ghcr.io/your-company/insurance-agent-web:latest
DB_PASSWORD=每條team自己一個強密碼
JWT_SECRET=每條team自己一個32字以上隨機字串
ANTHROPIC_API_KEY=sk-ant-xxxxx
CLOUDFLARE_TUNNEL_TOKEN=每條team自己嘅tunnel token
TUNNEL_DOMAIN=team-a.yourcompany.com
```

如果 GHCR image 係 private，再填：

```env
GHCR_USER=your_github_username
GHCR_READ_TOKEN=github_pat_read_packages_token
```

並喺 Mac mini login 一次：

```bash
echo "github_pat_read_packages_token" | docker login ghcr.io -u your_github_username --password-stdin
```

### 啟動

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

檢查：

```bash
docker compose -f docker-compose.prod.yml ps
```

---

## 4. 更新版本

平時你 push 去 `main`，GitHub Actions 會出新 image。

Mac mini 有 watchtower，預設每小時 check 一次並更新 `app` container。

想即刻手動更新：

```bash
cd ~/insurance-agent-web
docker compose -f docker-compose.prod.yml pull app
docker compose -f docker-compose.prod.yml up -d app
```

---

## 5. 每條 team 要分開嘅資料

每部 Mac mini 都要獨立：

- `DB_PASSWORD`
- `JWT_SECRET`
- `CLOUDFLARE_TUNNEL_TOKEN`
- `TUNNEL_DOMAIN`
- PostgreSQL volume `pgdata`

唔好共用 database，唔好將 `.env` push 上 GitHub。

---

## 6. 常用維護指令

```bash
docker compose -f docker-compose.prod.yml logs -f app
```

```bash
docker compose -f docker-compose.prod.yml restart app
```

```bash
docker compose -f docker-compose.prod.yml down
```

```bash
docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d
```

---

## 7. Schema 升級

而家已經加咗 `migrations/` 同 `node-pg-migrate`。每次 `docker compose -f docker-compose.prod.yml up -d`，`migrate` container 會先跑完 database migration，之後 `app` 同 `worker` 先啟動。

平時更新做法：

```bash
cd ~/insurance-agent-web
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

檢查 migration：

```bash
docker compose -f docker-compose.prod.yml logs migrate
docker compose -f docker-compose.prod.yml ps
```

`schema.sql` 仍然係 fresh install 用嘅 canonical schema；之後所有改欄位、加表，都應該用 `npm run migrate:create` 加 migration，唔好靠手動改 production DB。

---

## 8. 備份建議

Production compose 已經有 `backup` sidecar，每日香港時間 02:30 自動備份 PostgreSQL 同 uploaded documents 去 host folder：

```env
BACKUP_HOST_DIR=./backups
BACKUP_RETENTION_DAYS=30
```

手動即刻跑一次：

```bash
docker compose -f docker-compose.prod.yml exec backup /usr/local/bin/backup.sh
```

如果要放去公司 NAS / 加密硬碟，可以將 `BACKUP_HOST_DIR` 指去嗰個 mount 位；離線備份仍然建議用 FileVault / GPG / restic 加密。
