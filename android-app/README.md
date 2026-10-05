# BIG LANCHE Printer Bridge v2

Android WebView bridge for the BIG LANCHE kitchen panel.

## What changed
- Does not start a foreground service at app startup.
- Does not ask for Bluetooth permission until the user configures a printer.
- Loads the kitchen URL immediately without waiting for a printer.
- Exposes the exact bridge used by `kitchen/index.html`:
  - `AndroidPrinter.isReady()`
  - `AndroidPrinter.connectPrinter()`
  - `AndroidPrinter.printEscPos(raw)`
  - `AndroidPrinter.disconnectPrinter()`
- Uses Bluetooth Classic SPP and sends raw ESC/POS bytes.
- Any paired Bluetooth Classic ESC/POS-compatible printer can be selected; the app is not limited to RP80-PLUS.

## Important compatibility note
"Any printer" here means Bluetooth Classic printers that accept ESC/POS over SPP. Wi-Fi, USB, BLE-only, AirPrint/Mopria, and proprietary printer protocols require a different transport/driver.

## GitHub layout
Keep the Android project at:
`android-app/BIG_LANCHE_PrinterBridge/`

Replace the existing project files with this project. Also replace the site's `kitchen/index.html` with the included updated version from the integration package.

The GitHub Actions workflow should build from:
`android-app/BIG_LANCHE_PrinterBridge`
