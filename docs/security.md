# Sécurité locale

Sont non fiables : roots fournis, markers, symlinks, noms, JSON, environnement, processus concurrents, skills existants et sorties externes.

- Les roots sont absolus, canonisés par `realpath` et comparés avec `path.relative`.
- Les roots et zones sensibles symboliques sont refusés.
- `marker.root` doit correspondre à son emplacement réel.
- Une Feature doit être strictement contenue dans son Project.
- Les JSON sont bornés à 2 Mio et lus via `lstat`.
- Sur POSIX, les index/logs privés utilisent `0600` et les markers portables
  `0644`. Sous Windows, les droits héritent des ACL du profil utilisateur ; les
  modes POSIX n'y constituent pas une preuve d'isolation.
- Les écritures atomiques synchronisent le fichier puis le dossier quand le
  système le permet. Windows ne supportant pas le `fsync` d'un dossier via
  Node.js, cette seconde synchronisation y est ignorée uniquement pour `EPERM`.
- Les locks portent un token, un PID et une date ; un processus vivant n’est
  jamais repris et seul le token propriétaire peut libérer le verrou. La
  contention Windows `EPERM` n'est assimilée à un verrou existant qu'après
  vérification du fichier ou, s'il vient de disparaître, du droit d'écriture
  sur son dossier parent. Le reaper n'est créé que pour un lock réellement
  stale.
- Les install/scaffold refusent l’écrasement implicite.
- Toute mutation exige l’écriture préalable d’une intention dans le journal
  d’audit ; un échec empêche la mutation. Le journal masque les secrets, tourne
  à 2 Mio et conserve au plus cinq archives.
- Aucun shell n’est utilisé pour piloter la TUI ou les cas d’usage.

`arka-norn doctor --repair` ne modifie rien. Ajouter `--apply` pour isoler l’index corrompu dans un backup puis le réinitialiser. Le diagnostic couvre aussi markers, locks, audit trail et installation des skills. Les scans explicites reconstruisent ensuite les index depuis les markers valides.
