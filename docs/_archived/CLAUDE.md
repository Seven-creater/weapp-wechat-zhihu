# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview
- WeChat Mini Program; app entry is `app.js` and global config is `app.json`.
- Pages live under `pages/` with the standard `.js/.wxml/.wxss/.json` quartet.
- Most pages render local mock data from `data/` (via `utils/util.js` or direct `require`).
- Cloud Functions live in `cloudfunctions/<name>/` and use `wx-server-sdk` to access cloud DB/storage.

## Architecture & data flow
- App boot initializes cloud env and global state in `app.js`; changes to login/init should start there.
- UI data flow is typically: page module -> `utils/util.js` -> `data/*.js` mock datasets. Update both data and page parsing when changing fields.
- Image/AI analysis uses cloud storage + cloud functions (see `cloudfunctions/analyzeIssue/index.js`), with optional external AI API calls (keys must come from env vars, not repo).
- `openid` is stored in local storage for simplified auth; avoid removing it unless updating all dependent queries and logic.

## Commands & workflows
- Run the app: import the repo root into WeChat Dev Tools (no build step).
- Cloud functions: run `npm install` inside a function folder if it has a `package.json`, then deploy via the WeChat cloud console/CLI.

## Repo-specific conventions
- Use CommonJS (`require`/`module.exports`), don’t convert to ESM.
- Be cautious with `.wxml/.wxss` changes and validate in WeChat Dev Tools.
- `app.json` `debug: true` affects log verbosity.
- Cloud env uses `cloud.DYNAMIC_CURRENT_ENV` (see `app.js` init config).

## Reference docs to follow
- README setup notes and constraints (local mock data, dev tools import).
- `.github/copilot-instructions.md` for detailed project conventions and examples.
