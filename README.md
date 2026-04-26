# Drone Mapping Future Lab

Interactive web app concept for future drone mapping missions.

Live app: https://trenn1x.github.io/drone-mapping-future-lab/

## What's New

The app now includes:
- Tailwind-based UI refresh with mobile-friendly layout
- Scenario presets for forestry, construction, disaster response, and utility corridors
- Battery logistics modeling (endurance, swaps, recharge windows)
- Cost forecasting (flight + crew + AI processing)
- Risk alert system with severity levels
- Mission timeline breakdown by phase
- Export tools for JSON and CSV
- Copyable mission brief for ops handoff
- Shareable URL links with full mission state in query params

## Inputs

- Survey area
- Terrain roughness
- Canopy/occlusion
- Wind volatility
- Resolution target
- No-fly constraints
- Swarm size
- Risk tolerance
- Objective, battery profile, comms mode
- Cost per drone-hour

## Outputs

- Altitude and overlap strategy
- Mission duration
- Confidence and revisit demand
- Coverage heatmap with no-fly zones
- Battery swap and crew recommendations
- Total and per-km² cost estimates

## Local Run

No build step is required.

1. Open `index.html` directly in a browser, or
2. Run a local server:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Deployment

The repository is configured for GitHub Pages from the `main` branch root (`/`).
