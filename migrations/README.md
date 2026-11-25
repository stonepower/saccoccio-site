# Migrations D1

EmDash crée et fait évoluer **lui-même** son schéma (tables `_emdash_*`,
`options`, `users`, etc.) : les workflows de déploiement l'appliquent avec
`scripts/emdash-migrate.mjs`. Ce dossier ne contient que **nos** tables,
appliquées ensuite par `wrangler d1 migrations apply` (table de suivi
`d1_migrations`, distincte de celle d'EmDash).

| Migration | Rôle |
| --- | --- |
| `0001_contact_messages.sql` | Messages du formulaire de contact en mode `store` (purgés à 30 jours par le Worker, jamais affichés) |
| `0002_annonces.sql` | Annonces Immonot (import par différence, voir `docs/annonces.md`) ; jamais d'adresse ni de coordonnées précises |

- Nommage : `NNNN_description.sql` (créé avec
  `npx wrangler d1 migrations create saccoccio-db-staging description`).
- Ne JAMAIS y mettre de données personnelles : schéma uniquement.
- Une migration appliquée ne se modifie plus : on en écrit une nouvelle.
- Ne pas toucher aux tables gérées par EmDash.
