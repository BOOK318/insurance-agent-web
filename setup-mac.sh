#!/bin/bash
# =============================================
# InsuranceAI — Mac mini 一鍵安裝腳本
# 每部新Mac mini跑一次
# =============================================

set -e
echo "🚀 InsuranceAI Mac mini 安裝開始..."

# 1. 安裝Homebrew（如果未有）
if ! command -v brew &>/dev/null; then
  echo "📦 安裝Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# 2. 安裝Docker Desktop
if ! command -v docker &>/dev/null; then
  echo "🐳 安裝Docker..."
  brew install --cask docker
  echo "⚠️  請打開Docker Desktop，等佢完全啟動後再按Enter繼續..."
  read -r
fi

# 3. 建立設定資料夾
mkdir -p ~/insurance-ai
cd ~/insurance-ai

# 4. 下載docker-compose.yml
echo "📥 下載設定檔..."
curl -fsSL https://raw.githubusercontent.com/YOUR_GITHUB/insurance-agent-web/main/docker-compose.yml -o docker-compose.yml

# 5. 建立.env檔
if [ ! -f .env ]; then
  echo ""
  echo "⚙️  設定環境變數（請輸入以下資料）："
  read -rp "資料庫密碼 (DB_PASSWORD): " DB_PASSWORD
  read -rp "JWT密鑰 (隨機32字): " JWT_SECRET
  read -rp "Claude API Key: " ANTHROPIC_API_KEY
  read -rp "Cloudflare Tunnel Token: " CLOUDFLARE_TUNNEL_TOKEN
  read -rp "Team域名 (例: team-a.yourcompany.com): " TUNNEL_DOMAIN
  read -rp "GitHub用戶名: " GITHUB_USER

  cat > .env << EOF
DB_PASSWORD=${DB_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
CLOUDFLARE_TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
TUNNEL_DOMAIN=${TUNNEL_DOMAIN}
GITHUB_USER=${GITHUB_USER}
EOF
  echo "✅ .env 已建立"
fi

# 6. 啟動所有服務
echo "🐳 啟動Docker服務..."
docker compose pull
docker compose up -d

# 7. 等待資料庫就緒
echo "⏳ 等待資料庫啟動..."
sleep 10

echo ""
echo "✅ 安裝完成！"
echo ""
echo "📱 Agent登入網址: https://${TUNNEL_DOMAIN}"
echo "🔑 預設Admin帳號: admin@team.local / Admin@1234"
echo "⚠️  請立即登入更改密碼！"
echo ""
echo "📋 常用指令："
echo "  查看狀態: docker compose ps"
echo "  查看log:  docker compose logs -f app"
echo "  重啟:     docker compose restart"
echo "  更新:     docker compose pull && docker compose up -d"
