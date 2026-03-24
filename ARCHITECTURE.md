# OmniDump - Architecture & Décisions Techniques (ADR)

Ce document fige les choix architecturaux majeurs du projet. Toute IA ou développeur travaillant sur cette base de code DOIT respecter ces contraintes.

## 1. Runtime et Base de Données (Le Cœur)
- **Décision :** Utilisation exclusive de l'API `bun:sql` intégrée à Bun (`import { SQL } from "bun"`).
- **Raison :** Élimine le besoin de dépendances lourdes (`pg`, `mysql2`, `sqlite3`). Offre des performances d'E/S maximales en C natif.
- **Interdiction :** N'installez JAMAIS de pilotes de bases de données tiers via npm/bun.

## 2. Abstraction SQL et Introspection
- **Décision :** Utilisation de `kysely`.
- **Raison :** Bun SQL exécute les requêtes mais ne gère pas les dialectes. Kysely est utilisé UNIQUEMENT comme générateur de requêtes (Query Builder) et pour interroger les schémas systèmes (`information_schema`, `sqlite_master`) afin d'obtenir la structure des tables. La requête SQL générée par Kysely est ensuite passée à `bun:sql` pour exécution.

## 3. Framework Full-Stack
- **Décision :** `@tanstack/start` (React).
- **Raison :** Regroupe le frontend et le backend (Server Functions) dans un seul routeur typé. Remplace la nécessité d'avoir une API REST séparée (Elysia) tout en gardant des performances de pointe.

## 4. Traitement des Fichiers Volumineux (CSV)
- **Décision :** Utilisation stricte de Node Streams (ou `ReadableStream` web) couplée à `csv-parse`.
- **Raison :** Un dump de 5 Go ferait crasher le conteneur s'il était chargé en RAM. Le fichier doit être lu, transformé et inséré en base de données de manière asynchrone par "chunks" (lots de 1000 à 5000 lignes maximum).

## 5. Interface Utilisateur (UI)
- **Décision :** `tailwindcss`, `shadcn/ui` et `@tanstack/react-table`.
- **Raison :** Éviter l'écriture de CSS custom. TanStack Table est indispensable pour le rendu performant de la grille de mapping des colonnes CSV vers les colonnes SQL.