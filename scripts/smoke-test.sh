#!/usr/bin/env bash
# Smoke test d'un environnement déployé.
# Usage : scripts/smoke-test.sh <url> <staging|production>
set -euo pipefail

URL="${1:?URL manquante}"
ENVIRONMENT="${2:?environnement manquant (staging|production)}"
URL="${URL%/}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() { echo "::error::$*"; exit 1; }

# 1. Page d'accueil : on réessaie (propagation workers.dev au premier déploiement).
status=""
for attempt in $(seq 1 20); do
	status="$(curl -sS -o "$TMP/home.html" -D "$TMP/home.headers" -w '%{http_code}' "$URL/" || true)"
	[ "$status" = "200" ] && break
	echo "Tentative $attempt : HTTP ${status:-erreur}, nouvel essai dans 10 s…"
	sleep 10
done
[ "$status" = "200" ] || fail "La page d'accueil répond HTTP ${status:-erreur} au lieu de 200."
grep -q '<html lang="fr"' "$TMP/home.html" || fail "La page d'accueil n'a pas <html lang=\"fr\">."
echo "✓ GET / → 200, lang=\"fr\""

# 1 bis. Le site doit rester disponible au-delà d'une minute. Un premier 200
# ne suffit pas : une migration coupée en cours de requête laisse un verrou,
# et EmDash ne répond 503 qu'une fois ce verrou vieux de plus de 60 s.
STABILITY_CHECKS="${SMOKE_STABILITY_CHECKS:-3}"
STABILITY_INTERVAL="${SMOKE_STABILITY_INTERVAL:-20}"
for check in $(seq 1 "$STABILITY_CHECKS"); do
	sleep "$STABILITY_INTERVAL"
	status="$(curl -sS -o /dev/null -w '%{http_code}' "$URL/" || true)"
	if [ "$status" = "503" ]; then
		fail "GET / répond 503 au contrôle de stabilité $check/$STABILITY_CHECKS (migrations EmDash en attente ou verrou bloqué ?)."
	fi
	[ "$status" = "200" ] || fail "GET / répond HTTP ${status:-erreur} au contrôle de stabilité $check/$STABILITY_CHECKS."
	echo "✓ contrôle de stabilité $check/$STABILITY_CHECKS (+$((check * STABILITY_INTERVAL)) s) : GET / → 200"
done

# 2. Indexation selon l'environnement.
robots="$(curl -sS -f "$URL/robots.txt")" || fail "robots.txt inaccessible."
if [ "$ENVIRONMENT" = "staging" ]; then
	grep -qi '^x-robots-tag:.*noindex' "$TMP/home.headers" || fail "En-tête X-Robots-Tag: noindex absent sur staging."
	grep -qx 'Disallow: /' <<<"$robots" || fail "robots.txt de staging ne contient pas « Disallow: / »."
	echo "✓ staging non indexable (X-Robots-Tag + robots.txt)"
else
	if grep -qi '^x-robots-tag:.*noindex' "$TMP/home.headers"; then
		fail "La production renvoie X-Robots-Tag: noindex."
	fi
	if grep -qx 'Disallow: /' <<<"$robots"; then
		fail "robots.txt de production interdit tout le site."
	fi
	grep -q '^Sitemap: https://' <<<"$robots" || fail "robots.txt de production sans ligne « Sitemap: »."
	echo "✓ production indexable"
fi

# 3. Back-office EmDash fermé.
admin_status="$(curl -sS -o /dev/null -w '%{http_code}' "$URL/_emdash/admin/" || true)"
[ "$admin_status" = "404" ] || fail "/_emdash/admin/ répond HTTP $admin_status au lieu de 404."
echo "✓ /_emdash/admin/ → 404"

echo "Smoke test $ENVIRONMENT OK : $URL"
