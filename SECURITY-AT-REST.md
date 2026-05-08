# 資料加密儲存（Encryption at rest）

呢部 Mac mini 放喺 brokerage office，如果俾人偷走，個 PostgreSQL volume + 上傳文件就會直接俾人讀到。
分兩層應對：

## 1. 全磁碟加密（最重要 — 一次設定）

開機進去 Mac mini：

```
System Settings → Privacy & Security → FileVault → Turn On…
```

啟用咗之後：

- 關咗機嘅 Mac mini 要解鎖密碼先讀到任何檔案
- Docker volume `pgdata`、`documents` 都自動受保護
- 對 application code 完全透明，唔需要改任何嘢

⚠️ 注意：set up 時會生成一個 **recovery key**，請寫低收好（保險櫃 / 公司密碼管理器）。冇咗呢條 key 加管理員密碼，就連你自己都解唔到鎖。

## 2. Column-level 加密（只用喺特別敏感嘅欄位）

對於 HKID（身份證）— 即使 volume 比人讀走，唔知道 application key 都解唔到。

Migration `1715040005000_pgcrypto.js` 已經：

- 啟動 `pgcrypto` extension
- 加咗 `clients.hkid_encrypted bytea` column

要實際用：

### 加 application 層 helper

```ts
// lib/hkid-crypto.ts
import { db } from './db';

const KEY = process.env.HKID_ENCRYPTION_KEY;
if (process.env.NODE_ENV === 'production' && !KEY) {
  throw new Error('HKID_ENCRYPTION_KEY missing');
}

export async function setHKID(clientId: string, hkid: string | null) {
  if (!hkid) {
    await db.query('UPDATE clients SET hkid_encrypted = NULL WHERE id = $1', [clientId]);
    return;
  }
  await db.query(
    `UPDATE clients SET hkid_encrypted = pgp_sym_encrypt($1, $2) WHERE id = $3`,
    [hkid, KEY, clientId]
  );
}

export async function getHKID(clientId: string): Promise<string | null> {
  const { rows } = await db.query<{ hkid: string | null }>(
    `SELECT pgp_sym_decrypt(hkid_encrypted, $1)::text AS hkid
     FROM clients WHERE id = $2`,
    [KEY, clientId]
  );
  return rows[0]?.hkid ?? null;
}
```

### 加 env 變數

```
# 生成一次：
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
HKID_ENCRYPTION_KEY=<base64-string>
```

⚠️ **唔好將呢條 key commit 入 git**，要喺 `.env` 入面，每部 Mac mini 一條。掉咗就所有 HKID 解唔返。可以同 `JWT_SECRET` 一齊存喺公司密碼管理器。

## 3. 我哋唔加密邊啲欄位（同原因）

- `name_zh` / `name_en` / `phone` / `email` — 因為 `/api/search` 同 `/api/ai` 嘅 client 名 lookup 都靠 `ILIKE`。如果加密咗就無法搜尋。
- 風險可接受，因為：FileVault 已經保護全 volume；database 只有 docker network 內部可達（已 bind 去 `127.0.0.1`）。

## 4. 備份檔案都要加密

`scripts/backup.sh` 寫嘅 `.sql.gz` 同 `docs.tar.gz` 係 plaintext。如果你將 backup 推上公司 NAS / cloud，請額外加密：

```bash
# 用 GPG（symmetric）
gpg --symmetric --cipher-algo AES256 --output backup.sql.gz.gpg backup.sql.gz
```

或者用 `restic` / `borg`（內建加密 + 去重）取代 `tar`。下個 phase 嘅嘢。
