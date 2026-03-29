# OMNIDUMP - ROADMAP V2 : L'ARSENAL ÉTENDU

## PHASE 1 : Les Victoires Rapides (Fondations V2)
*Ces fonctionnalités exploitent l'architecture actuelle sans la bouleverser.*

* **🟢 Export CSV Simple :** * *Objectif :* Permettre l'export d'une table ciblée au format `.csv`.
    * *Tech :* Requête `SELECT *` via Kysely, conversion JSON vers CSV, streaming direct vers le navigateur.
* **⚡ Générateur de Fausses Données (Seeding) :**
    * *Objectif :* Remplir une table vide avec des données de test réalistes.
    * *Tech :* Intégration de `@faker-js/faker`, typage dynamique selon l'introspection Kysely (ex: générer des emails pour une colonne `email`).

## PHASE 2 : Opérations Avancées (Niveau DevOps)
*On attaque le vif du sujet de l'administration de base de données.*

* **🔥 Export Partiel (Cherry-picking) :**
    * *Objectif :* Sélectionner à la carte les tables à dumper (ignorer les logs, focus sur les tables métiers).
    * *Tech :* Modification de la commande `Bun.spawn` pour inclure le flag `-t` (table) ciblé sur `pg_dump` ou MySQL.
* **🚇 Connexion via Tunnel SSH :**
    * *Objectif :* Accéder aux bases de production sécurisées.
    * *Tech :* UI dans le "Patchbay", et utilisation d'un module Node pour ouvrir un tunnel SSH local avant de lancer les commandes de dump.
* **🛡️ Anonymisation des données (Data Masking) :**
    * *Objectif :* Remplacer les données sensibles lors de l'export.
    * *Tech :* *Très complexe avec les utilitaires natifs.* Demandera sûrement de faire l'export, puis de parser le SQL généré pour masquer les valeurs, ou de passer par des vues SQL temporaires.

## PHASE 3 : Le Boss de Fin (Module ETL)
*Le chantier qui va te faire gagner des heures au travail.*

* **💀 Import CSV Multi-Tables (Le Mapper) :**
    * *Objectif :* Prendre un fichier plat et distribuer ses colonnes dans des tables relationnelles, en respectant les clés étrangères.
    * *Tech :* 1. **UI :** Créer une interface de "Brassage" (Patching) où l'utilisateur relie les colonnes du CSV aux colonnes des tables.
        2. **Logique :** Gérer l'ordre d'insertion (ex: insérer le `User` d'abord pour récupérer son `ID`, puis insérer la `Commande` liée).
        3. **Transactionnel :** Tout doit s'exécuter dans un `BEGIN ... COMMIT`. Si une ligne du CSV plante, tout s'annule (`ROLLBACK`) pour ne pas corrompre la base.