# G2 Timer

A minimal countdown timer app for Even Realities G2 glasses, built with TypeScript and Vite.

## Features

- **Preset durations**: 1, 3, 5, 10, 15, 30, 60 minutes
- **Simple controls**: Select preset, start/pause, and reset with taps
- **Optimized UI**: Monochrome green micro-LED HUD display
- **Efficient updates**: Text updates only once per second when running
- **Lifecycle aware**: Handles foreground/background transitions properly

## Installation

1. **Create project** (if not already created):
   ```bash
   npx -y create-vite@latest g2-timer --template vanilla-ts
   cd g2-timer
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```
   
   If the simulator package fails to install, you can install it globally instead:
   ```bash
   npm install -g @evenrealities/evenhub-simulator
   ```
   Then update the `dev:sim` script in `package.json` to use `evenhub-simulator` instead of `npx @evenrealities/evenhub-simulator`.

## Usage

### Development with Simulator

Run the app with the Even Hub simulator:

```bash
npm run dev:sim
```

This will:
- Start the Vite dev server on `http://localhost:5173`
- Launch the Even Hub simulator automatically
- Display a QR code in the terminal for device pairing (if using real hardware)

### Development for Real Hardware

1. **Start the dev server with QR code**:
   ```bash
   npm run dev:qr
   ```
   This will start the dev server and display a QR code in the terminal.

2. **Or start the dev server separately**:
   ```bash
   npm run dev
   ```
   Then in another terminal, generate the QR code:
   ```bash
   npm run qr
   ```

3. **Pair your G2 glasses**:
   - Scan the QR code displayed in the terminal with the Even app on your phone, or
   - Use the `evenhub-cli` workflow to connect your device

3. The app will load on your G2 glasses once connected.

### Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

### Preview Production Build

```bash
npm run preview
```

## Controls

The timer supports the following interactions:

- **Single tap on preset row** or **Single global tap**: Cycle to next preset duration
- **Tap on time display** or **Double global tap**: Toggle start/pause
- **Tap on title/status** or **Triple global tap**: Reset timer to selected preset

## Timer States

- **IDLE**: Timer is ready, select a preset to start
- **RUNNING**: Timer is counting down (updates every second)
- **PAUSED**: Timer is paused, can resume or reset
- **DONE**: Timer reached zero (blinks for 3 seconds)

## Technical Details

### Canvas Size
- **576×288 pixels** - Optimized for G2 HUD display

### Update Strategy
- Text updates occur **once per second** only when the timer is RUNNING
- State changes trigger immediate UI updates
- No image tiling issues (text-only UI, optional icons only update on state change)

### Lifecycle Management
- Properly handles foreground/background transitions
- Only one active interval exists at any time
- Clean shutdown on app exit

## Project Structure

```
g2-timer/
├── src/
│   ├── main.ts          # App initialization and event handling
│   ├── timerState.ts    # Timer state machine and interval management
│   ├── ui.ts            # UI rendering functions
│   └── constants.ts     # Presets, container IDs, layout constants
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Known Constraints

- Text updates are limited to once per second when running to avoid heavy image updates
- Image containers (if used) must match container size to avoid tiling issues
- The app requires Even Hub SDK bridge to be available before initialization

## Troubleshooting

- **Bridge not connecting**: Ensure the simulator is running or your G2 glasses are properly paired
- **Timer not updating**: Check that the app is in foreground (not backgrounded)
- **Taps not working**: Verify event handlers are set up correctly and check console for event logs
