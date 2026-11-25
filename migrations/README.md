# Migrations D1

EmDash crée et fait évoluer **lui-même** son schéma (tables `_emdash_*`,
`options`, `users`, etc.) au démarrage du Worker (`migrations.runtime: "auto"`,
valeur par défaut). Ce dossier est donc vide pour l'instant.

Il accueillera nos propres tables (par ex. les annonces Immonot), appliquées
par `wrangler d1 migrations apply` dans les workflows de déploiement.

- Nommage : `NNNN_description.sql` (créé avec
  `npx wrangler d1 migrations create saccoccio-db-staging description`).
- Ne JAMAIS y mettre de données personnelles : schéma uniquement.
- Une migration appliquée ne se modifie plus : on en écrit une nouvelle.
- Ne pas toucher aux tables gérées par EmDash.
