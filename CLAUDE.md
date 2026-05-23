# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

3D FGC (FIRST Global Challenge) robot competition simulator built with vanilla JavaScript and Three.js. The sim models robot autonomous behaviour, scoring, field geometry, and match timelines.

## Dev Commands

All commands run from `sim/`:
```
npm run dev        # Vite dev server → http://localhost:5173
npm run build      # Production build → dist/
node scripts/validate.mjs  # Run logic tests (must be run from sim/)
```

The Vite config whitelists `ignitinginnovation.simonaatula.fi` as an allowed host.

## Architecture Constraints

**`PARAMS` is a live singleton** (`src/sim/config.js`) mutated by the UI during a match. Never snapshot or cache it — always read fresh from the object.

**`src/field/dims.js` is the single source of truth** for all field dimensions (sourced from the 2026 FGC Game Manual §2.2). Never hardcode measurements elsewhere in the codebase.

## Testing

`node scripts/validate.mjs` (run from `sim/`) is the only test suite. It covers scoring math, climb timeline, trip planning, and swim-lane geometry. Run it after any changes to scoring, scheduling, steering, or field geometry before committing.

The script shims `globalThis.document` with a minimal canvas mock to avoid DOM dependency. If Three.js internals start touching the DOM in new ways, the shim may need updating.

## Code Style

- Vanilla JS (ES modules, no TypeScript)
- Two-space indentation, trailing semicolons
- camelCase for functions/variables, SCREAMING_SNAKE_CASE for constants
- No linter or formatter is configured
