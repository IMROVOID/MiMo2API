# MiMo2API · API & Client Integration Specification

## 1. Endpoints

### 1.1 `POST /v1/chat/completions`
Proxies standard OpenAI chat completion requests to the Xiaomi MiMo upstream.

#### Request Headers
- `Authorization: Bearer <API_KEY>` (or `Bearer mimo2api-dev-key`)
- `Content-Type: application/json`

#### Request Body (Standard OpenAI Schema)
```json
{
  "model": "mimo-x-pro",
  "messages": [
    { "role": "system", "content": "You are an expert software engineer." },
    { "role": "user", "content": "Write a TypeScript function to parse JWT payload." }
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 4096
}
```

#### Streaming Response (`stream: true`)
Standard Server-Sent Events stream:
```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1758234500,"model":"mimo-x-pro","choices":[{"index":0,"delta":{"role":"assistant","content":"Here is"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1758234500,"model":"mimo-x-pro","choices":[{"index":0,"delta":{"content":" the code:"},"finish_reason":null}]}

...

data: [DONE]
```

---

### 1.2 `GET /v1/models`
Returns list of available models supported by the router.

#### Response
```json
{
  "object": "list",
  "data": [
    {
      "id": "mimo-x-pro",
      "object": "model",
      "created": 1758234000,
      "owned_by": "xiaomi-mimo",
      "permission": [],
      "root": "MiMo-X-Pro-Preview",
      "parent": null
    },
    {
      "id": "mimo-x-flash",
      "object": "model",
      "created": 1758234000,
      "owned_by": "xiaomi-mimo",
      "permission": [],
      "root": "MiMo-X-Flash-Preview",
      "parent": null
    },
    {
      "id": "mimo-v2.5-pro",
      "object": "model",
      "created": 1758234000,
      "owned_by": "xiaomi-mimo",
      "permission": [],
      "root": "mimo-v2.5-pro",
      "parent": null
    }
  ]
}
```

---

### 1.3 `GET /v1/health`
Diagnostic endpoint to verify router status and credentials without consuming model quota.

#### Response
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "mode": "cloudflare-worker",
  "api_key_configured": true,
  "account_count": 2,
  "active_accounts": 2,
  "cooldown_accounts": 0,
  "supported_models": [
    "mimo-x-pro",
    "mimo-x-flash",
    "mimo-v2.5-pro",
    "mimo-v2.5-flash"
  ]
}
```

---

## 2. Client Integration Guides

### 2.1 Cursor
1. Go to **Cursor Settings → Models**.
2. Under **OpenAI API Key**, enter your configured `API_KEY` (e.g. `sk-mimo2api`).
3. Toggle **Override OpenAI Base URL** and enter:
   - Local: `http://localhost:20128/v1`
   - Cloudflare Worker: `https://mimo2api.<your-subdomain>.workers.dev/v1`
4. Add Model Name: `mimo-x-pro` or `mimo-x-flash`.

### 2.2 Claude Code CLI
Set environment variables:
```bash
export OPENAI_BASE_URL="http://localhost:20128/v1"
export OPENAI_API_KEY="sk-mimo2api"
export ANTHROPIC_MODEL="mimo-x-pro"
```

### 2.3 Cline / Roo Code (VS Code Extension)
1. Select API Provider: **OpenAI Compatible**.
2. Base URL: `http://localhost:20128/v1` (or Cloudflare Worker URL).
3. API Key: `<API_KEY>`.
4. Model ID: `mimo-x-pro`.
