# OpenRouter API

> **Category:** External Cloud Service  
> **Documentation:** [openrouter.ai](https://openrouter.ai/)

---

## Purpose

**OpenRouter** provides access to a wide range of LLMs (such as GPT-4, Claude, Gemini, and Llama) through a single API interface. DocLens uses it to handle translations, explanations, and summarization tasks.

---

## Integration Details

- **Server-Side Security Proxy:** To protect user keys, the client browser never contacts OpenRouter directly. Instead, requests are routed through a Cloudflare Worker proxy that attaches the `OPENROUTER_API_KEY` credential before forwarding the payload.
- **Model List Caching:** Fetches available models from `https://openrouter.ai/api/v1/models`. Models are filtered on the client to exclude non-text modalities (e.g., image generators).
- **Streaming Responses:** translation tasks use `streamCompletion()` to pipe text tokens to the UI in real-time, reducing perceived latency.

---

## Core Configurations

- **Request Formatting (`buildPagePayload`):** Assembles system prompt instructions, text blocks, temperature settings, and target languages.
- **Response Error Handling:** Checks for key issues (missing worker variables, invalid configurations, quota limits) and displays descriptive error states to the user.

---

## Relationships

- **Page integrations:** [[General Settings Page]] (connection check, model selection), [[Workspace Page]] (execution card).
- **Feature powered:** [[AI Translation]].
- **Team Owner:** [[Squad B — Translation]] and [[Shared Services]] API integration team.

---

_Part of [[MOC — APIs]]_
