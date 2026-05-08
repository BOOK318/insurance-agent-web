# InsuranceAI — 新機器安裝指引

---

## 安裝需時：約 15 分鐘
## 難度：★☆☆☆☆（唔需要技術背景）

---

## 你需要準備

| 項目 | 去邊攞 | 備註 |
|------|--------|------|
| Claude API Key | 聯絡我們 | 每個Team一條 |
| Cloudflare Tunnel Token | 聯絡我們 | 每個Team一個 |
| Team域名 | 聯絡我們 | 例如 team-a.yourcompany.com |
| 資料庫密碼 | 自己設定 | 最少12個字元 |

---

## Mac mini 安裝步驟

### 第一步：裝 Docker
1. 打開 Safari，去 **https://www.docker.com/products/docker-desktop**
2. 撳 「Download for Mac」
3. 打開下載嘅檔案，將 Docker 拖入 Applications
4. 打開 Docker Desktop，等佢完全啟動（頂部出現🐳圖示）

> ✅ 確認方法：打開 Terminal，輸入 `docker --version`，見到版本號即係成功

---

### 第二步：建立設定檔
1. 打開 Terminal（按 Cmd+Space，搜尋「Terminal」）
2. 逐行複製以下指令，貼入 Terminal 按 Enter：

```bash
mkdir -p ~/insurance-ai && cd ~/insurance-ai
```

```bash
git clone https://github.com/YOUR_GITHUB/insurance-agent-web.git .
```

3. 建立 `.env` 設定檔：
```bash
nano .env
```

4. 貼入以下內容（將 `xxxxx` 換成你嘅資料）：
```
DB_PASSWORD=your_strong_password_here
JWT_SECRET=your_random_32char_secret_here
ANTHROPIC_API_KEY=sk-ant-xxxxx
CLOUDFLARE_TUNNEL_TOKEN=eyJhbGci_xxxxx
TUNNEL_DOMAIN=team-a.yourcompany.com
APP_IMAGE=ghcr.io/YOUR_GITHUB/insurance-agent-web:latest
```

5. 按 `Ctrl+O` 儲存，再按 `Ctrl+X` 退出

---

### 第三步：啟動
```bash
cd ~/insurance-ai
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

等待約 2-3 分鐘，見到以下訊息即係成功：
```
✅ Container insurance-ai-db-1      Started
✅ Container insurance-ai-app-1     Started
✅ Container insurance-ai-cloudflared-1  Started
✅ Container insurance-ai-watchtower-1   Started
```

---

### 第四步：確認運作
打開瀏覽器，去你嘅 Team 域名（例如 https://team-a.yourcompany.com）

見到登入頁面即係安裝成功 🎉

---

## Windows 安裝步驟

### 第一步：裝 Docker
1. 去 **https://www.docker.com/products/docker-desktop**
2. 撳 「Download for Windows」
3. 執行安裝程式，全部選預設，完成後重啟電腦
4. 重啟後打開 Docker Desktop

> ✅ 確認方法：打開 PowerShell，輸入 `docker --version`

---

### 第二步：建立設定檔
1. 打開 PowerShell（按 Win 鍵，搜尋「PowerShell」）
2. 逐行執行：

```powershell
mkdir ~/insurance-ai
cd ~/insurance-ai
```

```powershell
git clone https://github.com/YOUR_GITHUB/insurance-agent-web.git .
```

3. 建立 `.env` 檔（用記事本）：
```powershell
notepad .env
```

4. 貼入同 Mac 一樣嘅內容，儲存關閉

---

### 第三步：啟動
```powershell
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

---

## 第一次登入

| 帳號 | 密碼 | 角色 |
|------|------|------|
| admin@team.local | Admin@1234 | 管理員 |

> ⚠️ **重要：第一次登入後立即改密碼！**

---

## 新增 Agent 帳號

登入後，叫我們幫你建立 Agent / Head 帳號。
每個帳號需要提供：
- 姓名
- 電郵（例如 chantwman@team.local）
- 角色（Agent 或 Head）

---

## 常用指令

```bash
# 查看運行狀態
docker compose ps

# 查看錯誤 log
docker compose logs -f app

# 重啟 App
docker compose restart app

# 手動更新至最新版本
docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d

# 完全停止
docker compose down
```

---

## 出問題怎辦

| 問題 | 解決方法 |
|------|----------|
| 打唔開網站 | 確認 Docker Desktop 係跑緊；試 `docker compose ps` |
| 登入唔到 | 確認 .env 入面嘅 JWT_SECRET 係填好 |
| 網站好慢 | 試 `docker compose restart app` |
| 其他問題 | 截圖 + `docker compose logs app` 嘅輸出，WhatsApp 我們 |

---

## 聯絡支援

📱 WhatsApp：+852 XXXX XXXX
📧 Email：support@yourcompany.com
⏰ 支援時間：Mon-Fri 9am-6pm

---

*文件版本：v1.0 · 最後更新：2026-05-06*
