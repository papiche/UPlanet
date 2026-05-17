#!/usr/bin/env bash
# Génère homer.json à partir des fichiers message_*.mp3 présents dans ce répertoire.
# Même principe que astroport.one/generate-media.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT="$SCRIPT_DIR/homer.json"

echo "[" > "$OUTPUT"
FIRST=true

for file in "$SCRIPT_DIR"/message_*.mp3; do
    [ -f "$file" ] || continue
    FILENAME=$(basename "$file")
    TITLE="${FILENAME%.mp3}"
    NUM="${TITLE##*_}"
    NUM=$((10#$NUM))

    if [ "$FIRST" = true ]; then
        FIRST=false
    else
        printf ',\n' >> "$OUTPUT"
    fi

    printf '{"url":"homer/%s","num":%d,"title":"%s"}\n' "$FILENAME" "$NUM" "$TITLE" >> "$OUTPUT"
done

printf '\n]\n' >> "$OUTPUT"
COUNT=$(grep -c '"url"' "$OUTPUT" 2>/dev/null || echo 0)
echo "✅ homer.json généré — ${COUNT} messages"
