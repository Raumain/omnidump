# OmniDump - Roadmap & Suivi d'Avancement

**Règle pour l'IA :** Mets à jour ce fichier après avoir terminé une fonctionnalité.

## Phase 1 : Socle et Infrastructure
- [x] Configurer l'environnement de développement (`ROADMAP.md`, `ARCHITECTURE.md`).
- [ ] Initialiser le projet TanStack Start.
- [ ] Configurer Biome et Husky (hook `pre-commit` avec typecheck et formatage).

## Phase 2 : Moteur Backend (Server Functions & Bun Streams)
- [ ] Créer le "Connection Manager" : Service pour stocker, tester et basculer entre plusieurs identifiants de bases de données (PostgreSQL, MySQL, SQLite).
- [ ] Créer le service d'introspection Kysely (extraire la liste des tables, colonnes, types et clés étrangères).
- [ ] **Feature CLI - Export :** Créer le service de génération de Dump SQL (lecture en stream de la base et renvoi d'un fichier `.sql` ou `.json` au client).
- [ ] **Feature CLI - Import :** Créer le service de restauration de Dump SQL (parser un gros fichier `.sql` en stream et l'exécuter par lots).
- [ ] Créer le service de parsing CSV (`csv-parse` en stream) et d'insertion dynamique par lots.

## Phase 3 : Interface Utilisateur (Frontend & shadcn/ui)
- [ ] Créer le layout principal avec un **Sélecteur de Base de Données** global dans la barre de navigation (le fameux "switch" de la CLI).
- [ ] Créer la page "Gestion des Connexions" (Ajouter/Modifier/Supprimer des identifiants BDD).
- [ ] **Feature CLI - Schéma :** Créer la page "Explorateur de Schéma" (Visualisation en arborescence des tables/colonnes).
- [ ] **Feature CLI - Dumps :** Créer la page "Sauvegardes" (Boutons pour générer et télécharger un dump complet ou partiel de la base active).
- [ ] Créer la page "Import & Mapping" (Zone de Drag & Drop pour `.sql` ou `.csv`).
- [ ] Implémenter le tableau interactif (`@tanstack/react-table`) pour associer visuellement les colonnes du CSV aux colonnes de la base cible.

## Phase 4 : Assemblage et Exécution
- [ ] Câbler l'interface de mapping CSV avec la Server Function d'insertion.
- [ ] Câbler la restauration de Dump `.sql` avec un retour visuel (barre de progression ou logs en temps réel via des Server-Sent Events).
- [ ] Ajouter une gestion d'erreurs stricte (ex: timeout de connexion, syntaxe SQL invalide dans le dump, type incompatible).

## Phase 5 : Déploiement et Auto-hébergement
- [ ] Rédiger le `Dockerfile` de production (multi-stage, image Alpine légère).
- [ ] Créer un conteneur persistant (Volume Docker) pour stocker le fichier SQLite local contenant les identifiants de connexion sauvegardés par l'utilisateur.
- [ ] Fournir un `docker-compose.yml` final.