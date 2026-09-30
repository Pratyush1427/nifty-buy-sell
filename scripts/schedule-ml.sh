#!/bin/bash
# Install / remove the nightly ML job (macOS launchd).
#   scripts/schedule-ml.sh install     run weekdays at 18:30 local time
#   scripts/schedule-ml.sh uninstall
#   scripts/schedule-ml.sh status
# The job re-scores every stock after market close and retrains the models
# once they are a week old. Missed runs (Mac asleep) run on the next wake.
set -euo pipefail

LABEL="com.niftysignals.ml-nightly"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/.venv/bin/python"
LOG="$ROOT/data/ml/nightly.log"

case "${1:-}" in
  install)
    [ -x "$PY" ] || { echo "Missing $PY. Create the venv first (see README)."; exit 1; }
    mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
    {
      cat <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>ProgramArguments</key>
  <array><string>$PY</string><string>-W</string><string>ignore</string><string>-m</string><string>ml.run</string><string>--nightly</string></array>
  <key>StartCalendarInterval</key>
  <array>
XML
      for day in 1 2 3 4 5; do
        echo "    <dict><key>Weekday</key><integer>$day</integer><key>Hour</key><integer>18</integer><key>Minute</key><integer>30</integer></dict>"
      done
      cat <<XML
  </array>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
  <key>EnvironmentVariables</key><dict><key>PYTHONUNBUFFERED</key><string>1</string></dict>
</dict>
</plist>
XML
    } > "$PLIST"
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    echo "Installed $LABEL: weekdays 18:30. Log: $LOG"
    ;;
  uninstall)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Removed $LABEL"
    ;;
  status)
    if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
      echo "$LABEL is installed."
      launchctl print "gui/$(id -u)/$LABEL" | grep -E "state|last exit" || true
      [ -f "$LOG" ] && { echo "--- last log lines"; tail -5 "$LOG"; }
    else
      echo "$LABEL is not installed."
    fi
    ;;
  *)
    echo "usage: $0 install|uninstall|status"; exit 2 ;;
esac
