# Distribution et release

arka.norn est distribué sous licence Apache-2.0 (fichiers `LICENSE` et
`NOTICE`) et publié sur le registre npm public. Le tarball npm attaché au
workflow GitHub déclenché par un tag `vX.Y.Z` reste le canal officiel des
artefacts internes.

## Préparer une version

1. Mettre à jour `version` dans `package.json` et `package-lock.json`.
2. Mettre à jour `CHANGELOG.md`.
3. Exécuter `npm run release:verify`. Cette commande inclut les gates qualité,
   la couverture globale et la couverture dédiée au code CLI
   (`npm run test:coverage:cli`), le benchmark, l'audit des dépendances et le
   contrôle du contenu du tarball.
4. Vérifier la compatibilité Node.js `>=22.13` et les matrices CI Node 22/24.
5. Créer et pousser le tag signé ou protégé `vX.Y.Z` depuis un commit vert.

La CI reconstruit le package, produit un SBOM CycloneDX, un fichier de checksums
SHA-256 et une attestation GitHub de provenance. Les tests du Pilote assisté y
utilisent des providers fake ; un smoke réel Claude, Codex, Kimi ou Z.AI reste
opt-in, avec identifiants et configuration fournis explicitement dans
l’environnement local, et ne doit pas être une gate de release ordinaire. Les
smokes ne lisent jamais un secret depuis un Project, une politique ou un
registre. L’artefact ne contient ni sources TypeScript, ni tests, ni dossiers
`.input/` ou `input/`.

## Installer et revenir en arrière

Installer un artefact vérifié avec `npm install -g ./arka-norn-X.Y.Z.tgz`, puis
exécuter `arka-norn selftest`. Pour revenir en arrière, vérifier le checksum du
tarball précédent, le réinstaller et relancer `selftest` puis `doctor`.

Les checks `quality`, `coverage`, `cli-coverage` et `dependencies` doivent être
requis par la protection de `main`. Cette règle de dépôt reste une configuration
GitHub, pas un fichier applicatif.
