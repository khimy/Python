#!/bin/sh
# Adds the local domain "swema" (127.0.0.1) to /etc/hosts on macOS or Linux.
# Run:  sh setup-swema-domain.sh     (asks for your password once)
set -e
HOSTS="${HOSTS:-/etc/hosts}"

# Already there? (any non-comment line that lists the name "swema")
if awk '!/^[[:space:]]*#/ { for (i = 2; i <= NF; i++) if (tolower($i) == "swema") found = 1 } END { exit !found }' "$HOSTS"; then
    echo "\"swema\" is already set up in $HOSTS."
else
    printf '\n127.0.0.1\tswema\n' | sudo tee -a "$HOSTS" > /dev/null
    echo "Added \"127.0.0.1 swema\" to $HOSTS."
fi

# Clear the DNS cache so the new name works straight away
if [ "$(uname)" = "Darwin" ]; then
    sudo dscacheutil -flushcache
    sudo killall -HUP mDNSResponder 2>/dev/null || true
elif command -v resolvectl > /dev/null 2>&1; then
    sudo resolvectl flush-caches 2>/dev/null || true
fi

echo 'Done. Now run:  sh start-swema.sh   and open http://swema/'
