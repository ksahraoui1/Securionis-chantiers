# Securionis Chantiers

Application SaaS de gestion des inspections de chantiers (sécurité au travail, référentiels SUVA).

## Fonctionnalités

- 🏗️ **Gestion des chantiers** — CRUD complet avec inspecteurs rattachés
- 📋 **Visites d'inspection** — Checklist de 487 points de contrôle SUVA, recherche full-text, familles
- 📸 **Annotation photos** — Annotations directes sur les photos, analyse IA
- ⚠️ **Non-conformités** — Saisie, suivi, rapports
- 📐 **Comparaison de plans PE / EXE** — Superposition, recalage, détection automatique des différences, rapport
- 📄 **Rapports PDF** — Génération et envoi par email (Resend)
- 💾 **Hors-ligne** — PWA + IndexedDB + Service Worker
- ⚖️ **Assistant juridique** — Réponses ancrées sur le corpus des points de contrôle
- 📊 **Dashboard** — KPIs, graphique NC, chantiers urgents
- 👥 **Multi-rôles** — Administrateur, Inspecteur, Invité
- 🔐 **Second facteur** — code à six chiffres par application d'authentification, activable depuis « Sécurité du compte »

## Stack

**Frontend :** Next.js 16 · TypeScript · React · Tailwind CSS v4
**Backend :** Supabase (Postgres + Auth + Storage + RLS)
**Services :** Resend (email) · Anthropic Claude (IA) · Sentry (monitoring, optionnel)

## Démarrage

```bash
npm install
npm run dev
```

Puis ouvre `http://localhost:3000/login`

## Déploiement

**VPS Hostinger (Docker, image `standalone` en trois étapes)** :
```bash
cd /app/securionis && git pull && docker builder prune -f && docker compose build --no-cache && docker compose up -d && docker image prune -a -f
```

Les valeurs `NEXT_PUBLIC_*` sont lues dans le `.env` du VPS au build ; les secrets n'entrent jamais dans l'image. Les migrations Supabase s'appliquent séparément (la base est sur Supabase Cloud).

Production : `https://chantiers.securionis.com`

## Documentation

- [CLAUDE.md](./CLAUDE.md) — guide complet de développement, décisions et pièges connus
- [docs/FEATURES.md](./docs/FEATURES.md) — spécification des fonctionnalités et procédure de déploiement
