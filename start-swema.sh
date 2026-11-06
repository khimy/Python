#!/bin/sh
# Starts the SWEMA map. Port 80 (http://swema/) needs sudo on macOS / Linux:
#   sudo sh start-swema.sh        -> http://swema/
#   sh start-swema.sh             -> http://swema:8080/  (no sudo)
cd "$(dirname "$0")"
if [ "$(id -u)" -eq 0 ]; then
    exec python3 serve.py --port 80 "$@"
else
    exec python3 serve.py --port 8080 "$@"
fi
