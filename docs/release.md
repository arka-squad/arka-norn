# Distribution et release

arka-norn est un produit interne propriétaire (`private: true`, licence
`UNLICENSED`). Il n’est pas publié sur le registre npm public. Le canal officiel
est un tarball npm attaché au workflow GitHub déclenché par un tag `vX.Y.Z`.

## Préparer une version

1. Mettre à jour `version` dans `package.json` et `package-lock.json`.
2. Mettre à jour `CHANGELOG.md`.
3. Exécuter `npm run release:verify`. Cette commande inclut les gates qualité,
   la couverture globale et la couverture dédiée au code CLI
   (`npm run test:coverage:cli`), le benchmark, l'audit des dépendances et le
   contrôle du contenu du tarball.
4. Créer et pousser le tag signé ou protégé `vX.Y.Z` depuis un commit vert.

La CI reconstruit le package, produit un SBOM CycloneDX, un fichier de checksums
SHA-256 et une attestation GitHub de provenance. L’artefact ne contient ni
sources TypeScript, ni tests, ni dossiers `.input/` ou `input/`.

## Installer et revenir en arrière

Installer un artefact vérifié avec `npm install -g ./arka-norn-X.Y.Z.tgz`, puis
exécuter `arka-norn selftest`. Pour revenir en arrière, vérifier le checksum du
tarball précédent, le réinstaller et relancer `selftest` puis `doctor`.

Les checks `quality`, `coverage`, `cli-coverage` et `dependencies` doivent être
requis par la protection de `main`. Cette règle de dépôt reste une configuration
GitHub, pas un fichier applicatif.
