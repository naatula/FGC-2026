# FGC 2026 — Igniting Innovation: 3D Match Simulation

Browser-based 3D simulation of a 2026 *FIRST* Global Challenge match.

## Run

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

## Features

- Full 7 m × 7 m playing field with both Suppression Units, Extinguisher,
  Fire Shields, and Braces (Zones 1/2/3).
- Six robots (3 red, 3 blue) in their Regional Zones.
- 500 wildfire balls released from the Extinguisher base at "go".
- Robots run the optimal-strategy timeline: rush → sustained scoring →
  position → triple Zone-3 climb → Coopertition bonus.
- Live HUD: match timer, red/blue regional scores with multipliers,
  partner-climb counter, extinguisher count, coopertition badge.
- Configurable parameters for realistic matches
