---
name: Multi-Account Architecture
description: How the multi-account Telegram system works in this project — key decisions for consistency.
---

## Rule
The backend uses `AccountManager` (in `artifacts/api-server/src/services/telegram.ts`) which manages a `Map<id, TelegramAccountClient>`. A backward-compatible alias `export const telegramService = accountManager` keeps all existing routes working without modification.

**Why:** The original single-singleton design destroyed the previous session on every new login. The new design keeps all accounts alive simultaneously.

## How it works
- `send-code` → calls `accountManager.discardPending()` + `startPendingLogin()` to open a fresh slot WITHOUT touching existing accounts.
- `verify-code` → calls `accountManager.commitPending()` which moves pending → accounts map and sets it as active.
- Sessions persist to `/tmp/anwer_accounts.json` and are reloaded + reconnected on server restart.
- `/api/accounts` endpoints: GET (list), POST /switch, DELETE /:id

## Frontend
- Layout.tsx shows account switcher panel in the sidebar (click active account row to expand).
- "Add account" navigates to `/login?mode=add` — Login.tsx detects `?mode=add` and shows add-account UI without affecting existing sessions.
- After successful login, always redirects to `/` which reloads the dashboard for the new active account.

## API credentials
FIXED_API_ID = 22043994, FIXED_API_HASH = "56f64582b363d367280db96586b97801" — hardcoded, never prompt user.
