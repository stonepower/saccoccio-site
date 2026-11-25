# saccoccio-site

Nouveau site de l'étude Saccoccio & Associés, notaires à Manosque
(`saccoccio-et-associes-manosque-notaires.fr`).

**Stack :** Astro + [EmDash](https://docs.emdashcms.com/) sur Cloudflare
Workers, avec D1, R2 et KV.

| Environnement | URL |
| --- | --- |
| staging (non indexé) | https://saccoccio-staging.lcollin.workers.dev |
| production | https://saccoccio-prod.lcollin.workers.dev |

## Publier

- **Staging** : merger une PR dans `main` déploie automatiquement.
- **Production** : créer un tag `v*` (par ex. `v0.1.0`), puis approuver le
  déploiement dans l'onglet Actions.

## Développer (facultatif, en local)

Node : voir `.nvmrc`.

```bash
npm ci
npm run dev
```

Règles du projet, ressources Cloudflare et migrations D1 : voir
[`CLAUDE.md`](./CLAUDE.md).

⚠️ Ne jamais versionner l'ancien site ni ses sauvegardes : ils contiennent
des données personnelles.
