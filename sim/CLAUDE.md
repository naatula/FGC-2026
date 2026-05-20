# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS + Three.js simulation, built with Vite. ES modules throughout (`"type": "module"`). No TypeScript, no framework.

## Commands

```bash
npm run dev       # dev server at http://localhost:5173
npm run build     # production build → dist/
node scripts/validate.mjs  # headless logic tests (run from sim/)
```

Run `node scripts/validate.mjs` after any logic change (scoring, scheduling, steering, field geometry). It is the only test suite — treat it as a gate before committing.

## Key architecture

- `src/sim/config.js` exports a `PARAMS` singleton that is mutated live by the UI via a pub/sub listener. Do not snapshot or cache it — always read from the object directly.
- Field dimensions are the single source of truth in `src/field/dims.js`. Import from there; do not hardcode measurements elsewhere.

## Gotchas

- `scripts/validate.mjs` uses a `globalThis.document` shim. If Three.js internals start touching the DOM in new ways, the shim may need updating.
- `dist/` should not be committed — add it to `.gitignore` if not already present.
