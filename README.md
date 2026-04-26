# Drone Mapping Future Lab

Interactive web app concept for next-generation drone mapping missions.

It simulates how an autonomous swarm could adapt flight planning based on:
- Terrain roughness and canopy occlusion
- Wind volatility
- Resolution targets
- No-fly corridor constraints
- Mapping objective (orthomosaic, change detection, thermal, volumetric)

The app outputs:
- Recommended altitude and overlap strategy
- Mission duration estimate
- Confidence estimate and revisit ratio
- Adaptive heatmap showing where additional passes are likely required

## Local Run

No build step is required.

1. Open `index.html` directly in a browser, or
2. Run a local server:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Deploy

Deployment is automated via GitHub Actions in `.github/workflows/deploy-pages.yml`.
On every push to `main`, the site deploys to GitHub Pages.
