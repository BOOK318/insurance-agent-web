# 喺 Mac mini 行 Whisper 做粵語語音辨識

## 點解要做

而家 agent 喺 `/clients/new` 同 `/ai` 用嘅語音輸入，係靠瀏覽器嘅 Web Speech API。
喺 Android Chrome 上面，個音頻會送到 Google Cloud Speech 處理 — 即係話：

- 數據冇送俾 Anthropic ✓
- 但係送咗俾 Google ✗

如果 brokerage 對「completely on-prem」有要求，就要將語音辨識搬返本機。
方案：喺 Mac mini 行 OpenAI Whisper（model 開源 + 跑得 offline），開個 HTTP endpoint 畀 app 用。

## 推薦做法：`whisper.cpp` server

[`whisper.cpp`](https://github.com/ggml-org/whisper.cpp) 係 C++ 實現，Apple Silicon 用 Metal 加速，比 Python 版本快好多，亦唔需要裝 Python / CUDA。

### Mac mini setup

```bash
# 1. 安裝 Homebrew（如果未有）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. clone + build
cd ~
git clone https://github.com/ggml-org/whisper.cpp
cd whisper.cpp
make -j

# 3. 下載 model（粵語建議用 medium 或 large-v3）
# - tiny / base：細，唔太準確
# - small：~466 MB，廣東話過得去
# - medium：~1.5 GB，廣東話幾好
# - large-v3：~3 GB，最好但慢
sh ./models/download-ggml-model.sh medium

# 4. 試用本地檔案
./build/bin/whisper-cli -m models/ggml-medium.bin -l zh -f samples/jfk.wav

# 5. 行 HTTP server
./build/bin/whisper-server \
  --model models/ggml-medium.bin \
  --language zh \
  --port 9000 \
  --host 127.0.0.1
```

呢個 server 接受 multipart upload `/inference`，會回 JSON：

```bash
curl 127.0.0.1:9000/inference \
  -F file=@audio.wav \
  -F temperature="0.0" \
  -F response_format="json"
```

回應：

```json
{ "text": "我有個新客戶叫陳大文..." }
```

### 做 launchd service（開機自動啟動）

寫一個 `~/Library/LaunchAgents/local.whisper-server.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>local.whisper-server</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/<你嘅 user>/whisper.cpp/build/bin/whisper-server</string>
    <string>--model</string><string>/Users/<你>/whisper.cpp/models/ggml-medium.bin</string>
    <string>--language</string><string>zh</string>
    <string>--port</string><string>9000</string>
    <string>--host</string><string>127.0.0.1</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/whisper.log</string>
  <key>StandardErrorPath</key><string>/tmp/whisper.err</string>
</dict></plist>
```

然後：

```bash
launchctl load ~/Library/LaunchAgents/local.whisper-server.plist
curl 127.0.0.1:9000/inference  # 確認啟動咗
```

## App side：已加 `/api/transcribe`

App 而家已經有 `app/api/transcribe/route.ts`：

- Agent 必須登入先可以用。
- Browser 錄音會送去 Mac mini 本地 `whisper-server`。
- 錄音不會送去 Google / Claude / Anthropic。
- 預設限制 25 MB，可用 `TRANSCRIBE_MAX_BYTES` 調整。
- Dev 預設用 `http://127.0.0.1:9000/inference`。
- Docker production 預設用 `http://host.docker.internal:9000/inference`。

`.env.local`：

```
WHISPER_URL=http://127.0.0.1:9000/inference
TRANSCRIBE_MAX_BYTES=26214400
```

Docker `.env`：

```
WHISPER_URL=http://host.docker.internal:9000/inference
TRANSCRIBE_MAX_BYTES=26214400
```

`/clients/new` 同 `/ai` 已經改成優先用本地 MediaRecorder + `/api/transcribe`。如果 browser 或咪高峰權限唔支援，先 fallback 去舊 Web Speech API。

## Browser side：MediaRecorder + 上載

已經喺 `/clients/new` 同 `/ai` 接好；下面只係簡化版流程，實際 UI 用同一粒咪高峰掣開始 / 停止錄音。

```ts
async function recordAndTranscribe(): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => chunks.push(e.data);

  return new Promise((resolve, reject) => {
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const fd = new FormData();
      fd.append('audio', blob, 'audio.webm');
      const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) reject(new Error(data.error)); else resolve(data.text);
    };
    recorder.start();
    // ⏱ stop after 30s, or expose a button to stop
    setTimeout(() => recorder.stop(), 30_000);
  });
}
```

## 性能參考（M2 Mac mini，medium model）

| 音頻長度 | 識別時間 | 準確度（粵語） |
|---|---|---|
| 10s | ~3s | 90%+ |
| 30s | ~9s | 90%+ |
| 60s | ~18s | 同上 |

對 agent 嘅 voice-input 場景（5–30s），medium model 已經夠用。
如果想再準啲，用 large-v3，但慢一倍 RAM 多一倍。

## 之後可以做

- 加 streaming（whisper.cpp `--stream` mode），辨識同 typing 一齊
- 廣東話 fine-tune model（HKUST 等有 release）— 比通用 medium 多 5-10% 準確
- 加 retry / queue，唔好 server crash 就影響 agent

呢個 phase 完成之後，`/api/parse-client` + `/api/ai` + `/api/transcribe` 全部 voice / image / text 都唔會經第三方 cloud。
