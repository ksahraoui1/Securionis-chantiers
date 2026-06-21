# Securionis Chantiers

Application SaaS de gestion des inspections de chantiers (sécurité au travail, référentiels SUVA).

## Fonctionnalités

- 🏗️ **Gestion des chantiers** — CRUD complet avec inspecteurs assignés
- 📋 **Visites d'inspection** — Checklist 568+ points de contrôle SUVA
- 📸 **Annotation photos** — Ajouter des annotations directes sur les photos
- ⚠️ **Non-conformités** — Saisir, tracker, générer rapports
- 📄 **Rapports PDF** — Génération et envoi par email (Resend)
- 💾 **Hors-ligne** — PWA + IndexedDB + Service Worker
- 🔔 **Notifications push** — Web Push avec VAPID
- 📊 **Dashboard** — KPIs, graphique NC, chantiers urgents
- 👥 **Multi-rôles** — Administrateur, Inspecteur, Invité

## Stack

**Frontend :** Next.js 16 · TypeScript · React · Tailwind CSS v4
**Backend :** Supabase (Postgres + Auth + Storage + RLS)
**Services :** Resend (email) · Stripe (paiement) · Anthropic Claude (IA) · Sentry (monitoring)

## Démarrage

```bash
npm install
npm run dev
```

Puis ouvre `http://localhost:3000/login`

## Déploiement

**VPS Hostinger (Docker)** :
```bash
cd /app/securionis
docker compose up --build -d
```

Production : `https://chantiers.securionis.com`

## Documentation

Voir [CLAUDE.md](./CLAUDE.md) pour le guide complet de développement.
