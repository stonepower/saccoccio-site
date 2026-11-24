#!/usr/bin/env bash
# Vérifie la taille compressée du Worker à partir de la sortie de
# `wrangler deploy --dry-run`. Le plan gratuit limite un Worker à 3 Mo (gzip).
# Usage : npx wrangler deploy --dry-run --env staging | tee out.txt
#         scripts/check-bundle-size.sh out.txt
set -euo pipefail

LIMIT_KIB="${WORKER_GZIP_LIMIT_KIB:-3072}"
line="$(grep -E 'Total Upload: .* gzip: ' "${1:?fichier de sortie manquant}" | tail -1)"
[ -n "$line" ] || { echo "::error::Taille du Worker introuvable dans la sortie de wrangler."; exit 1; }
gzip_kib="$(sed -E 's/.*gzip: ([0-9.]+) KiB.*/\1/' <<<"$line")"

echo "Taille du Worker (gzip) : ${gzip_kib} KiB / limite ${LIMIT_KIB} KiB"
if awk -v v="$gzip_kib" -v l="$LIMIT_KIB" 'BEGIN { exit !(v > l) }'; then
	echo "::error::Le Worker dépasse la limite du plan gratuit (${gzip_kib} KiB > ${LIMIT_KIB} KiB gzip)."
	exit 1
fi
if awk -v v="$gzip_kib" -v l="$LIMIT_KIB" 'BEGIN { exit !(v > l * 0.9) }'; then
	echo "::warning::Le Worker approche la limite du plan gratuit (${gzip_kib} KiB sur ${LIMIT_KIB} KiB gzip)."
fi
