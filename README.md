# AI Agent Control Panel

A cross-platform desktop app for chatting with multiple LLM backends from a single
interface, with API keys encrypted at rest by your operating system's keychain.

Built with Electron, electron-vite, React, Tailwind CSS, Zustand, and TypeScript.

## Features

- **Multiple providers** in one app, switchable per conversation:
  - **Ollama** — run open models locally
  - **OpenAI** — GPT models via the official API
  - **Anthropic** — Claude models via the Messages API
  - **GitHub Models** — free-tier catalog using a GitHub token
  - **OpenAI-compatible endpoints** — LM Studio, OpenRouter, vLLM, and similar
  - **GitHub Copilot** *(experimental, unofficial)*
- **Encrypted key storage** — secrets are encrypted in the main process via
  Electron `safeStorage` (macOS Keychain / Windows DPAPI / Linux secret service)
  and never exposed back to the UI.
- **GitHub device-flow login** for providers that support it, so no manual token
  copy-paste is required.
- **Streaming responses** with Markdown and syntax highlighting.

## Security

- API keys and tokens are encrypted at rest using the OS keychain and stored as
  ciphertext in your user-data directory — **never in this repository**.
- Plaintext keys stay in the Electron main process and are never sent over IPC to
  the renderer; the renderer can only set, clear, or check for the presence of a
  secret.
- Local runtime files (`vault.json`, `connections.json`, `conversations.json`,
  `settings.json`) live in the app's `userData` directory, not the project folder,
  and are also git-ignored defensively.

> The GitHub Copilot provider is experimental and unofficial; using it may violate
> GitHub's Terms of Service. Use at your own discretion.

## Requirements

- Node.js 18+
- npm

## Getting started

```bash
# install dependencies
npm install

# run in development
npm run dev
```

## Scripts

| Script              | Description                                      |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Start the app in development with hot reload      |
| `npm run build`     | Build main, preload, and renderer bundles         |
| `npm run preview`   | Preview the production build                       |
| `npm run typecheck` | Type-check the project with `tsc`                  |
| `npm run format`    | Format source files with Prettier                  |
| `npm run package`   | Build and package a macOS app with electron-builder |

## Project structure

```
src/
  main/        Electron main process (IPC, providers, encrypted vault, store)
    providers/ Provider adapters (ollama, openai, anthropic, copilot, …)
    github/    GitHub OAuth device flow
  preload/     Secure bridge exposed to the renderer
  renderer/    React UI (components, stores, styles)
  shared/      Types and IPC channel definitions shared across processes
```

## License

MIT
