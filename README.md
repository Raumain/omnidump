# OmniDump 🚀

OmniDump est un DevTool full-stack et auto-hébergé conçu pour les développeurs et data engineers. Il permet de gérer des bases de données relationnelles, d'extraire des schémas, de réaliser des dumps SQL et d'importer visuellement des fichiers CSV massifs grâce à un moteur de streaming haute performance.

Fini les crashs de RAM sur des imports de plusieurs gigaoctets. Fini les lignes de commande obscures pour mapper un fichier plat vers une table SQL complexe.

## ✨ Fonctionnalités Principales

- **Gestionnaire de Connexions :** Basculez instantanément entre vos bases PostgreSQL, MySQL et SQLite.
- **Explorateur de Schéma Visuel :** Introspection des bases de données pour visualiser les tables, colonnes et types en temps réel.
- **Moteur d'E/S en Streaming (Zéro Crash) :** Import et Export de dumps SQL massifs traités par lots (chunks) sans saturer la mémoire du serveur.
- **Mapping CSV Dynamique :** Interface drag-and-drop pour charger un CSV, visualiser un échantillon de données, et relier visuellement les colonnes du fichier aux colonnes de votre base cible.
- **Haute Performance :** Construit sur le runtime Bun, utilisant des I/O natives et des requêtes SQL optimisées.

## 🛠 Stack Technique

OmniDump utilise une architecture moderne, orientée sur la performance brute et l'inférence de types :

- **Runtime & DB Driver :** [Bun](https://bun.sh/) (API native `bun:sql` sans pilotes externes).
- **Framework Full-Stack :** [TanStack Start](https://tanstack.com/start) (React, Server Functions, SSR).
- **Introspection & Query Builder :** [Kysely](https://kysely.dev/).
- **Traitement de données :** `csv-parse` couplé aux Web Streams API.
- **Interface Utilisateur :** TailwindCSS, shadcn/ui, TanStack Table.
- **Qualité & Git :** Biome (Linter/Formatter), Husky (Pre-commit hooks).

## 🐳 Démarrage Rapide (Développement)

Le développement d'OmniDump est strictement encapsulé dans un **DevContainer** Docker pour garantir un environnement stérile et reproductible.

1. Clonez le dépôt :
   ```bash
   git clone [https://github.com/votre-nom/omnidump.git](https://github.com/votre-nom/omnidump.git)
   cd omnidump
2. Ouvrez le dossier dans VS Code ou Cursor.
3. Installer les dépendences 
```bash
bun install
```
4. Lancer le serveur de développement
```bash
bun dev
```

## Déploiement (Auto-hébergement)

(À venir) Un fichier docker-compose.yml sera fourni pour déployer OmniDump avec une image Alpine ultra-légère.

## 📜 Licence

MIT License