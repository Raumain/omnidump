# On part de l'image officielle Bun
FROM oven/bun:latest

# On passe temporairement en root pour l'installation
USER root

# 1. On installe les prérequis pour ajouter un nouveau dépôt
RUN apt-get update && apt-get install -y curl gnupg2 lsb-release

# 2. On ajoute la clé et le dépôt officiel de PostgreSQL
RUN curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg \
    && echo "deb http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list

# 3. On met à jour et on installe la version 15 précise + MySQL + SQLite
RUN apt-get update && apt-get install -y \
    postgresql-client-15 \
    default-mysql-client \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# On définit le dossier de travail
WORKDIR /app

# On rend la main à l'utilisateur non-root "bun" pour la sécurité
USER bun