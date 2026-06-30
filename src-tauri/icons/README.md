# App icons

These are generated, not hand-authored. From `forensic-frontend/`, run:

    pnpm tauri icon path/to/logo.png

with a square PNG (≥ 1024×1024). That writes `32x32.png`, `128x128.png`,
`128x128@2x.png`, `icon.icns` (macOS), `icon.ico` (Windows) here — the exact
files referenced by `tauri.conf.json > bundle.icon`. Commit the generated icons.
