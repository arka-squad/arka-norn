# Sécurité locale

Sont non fiables : roots fournis, markers, symlinks, noms, JSON, environnement, processus concurrents, skills existants et sorties externes.

- Les roots sont absolus, canonisés par `realpath` et comparés avec `path.relative`.
- Les roots et zones sensibles symboliques sont refusés.
- Le marker Project v4 et le marker Feature v3 ne contiennent aucun `root` non fiable ; la racine runtime est dérivée de leur emplacement après `realpath`. Le champ absolu historique des v1/v2 est validé puis supprimé par migration et n'est jamais utilisé comme destination runtime.
- Les index locaux ne redéfinissent jamais une identité : chaque Project et Feature indexé est rechargé depuis son marker et son identité est comparée avant lecture ou écriture.
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
- Les install/scaffold refusent l’écrasement implicite. Même avec `--force`, un scaffold ne peut pas écrire dans une zone réservée `.arka-norn`; un audit Project ne peut pas cibler une Feature ni un Project enfant.
- Les identifiants de session suivent `[a-z][a-z0-9-]{0,63}`. Un Agent spécialisé ne partage pas la sélection `main`; un prompt `execute` est refusé si son rôle ne correspond pas à la prochaine étape calculée. Le mode `prepare` interdit toute écriture.
- Une Feature marquée ne peut pas être inspectée sans registre Agent Project lisible : l’absence, la corruption ou un auteur hors scope produit un échec, jamais un fallback permissif.
- Toute mutation exige l’écriture préalable d’une intention dans le journal
  d’audit ; un échec empêche la mutation, y compris pour les scaffolds Pipeline.
  Le journal masque les secrets, refuse ses chemins symboliques, fichiers
  spéciaux et liens matériels, tourne à 2 Mio et conserve au plus cinq archives.
- Aucun shell n’est utilisé pour piloter la TUI ou les cas d’usage.

## Pilote assisté et workers

- `<project>/.arka-norn/orchestration.json` v2 ne conserve que la politique
  Project : assistants, modèles explicitement choisis, capacités, permissions
  et priorités. Il ne contient jamais de secret, token, PID, budget, état
  Mastra ni session de processus.
- `<project>/.arka-norn/executions.json` v2 conserve la trace métier des
  ordres, de la cible immuable assistant/adapter/modèle, des tentatives,
  événements bornés, preuves et suspensions. Les résumés, raisons et événements
  sont refusés s’ils ressemblent à des identifiants ou à du matériel
  d’autorisation.
- Les métadonnées de processus sont privées, jetables et reconstructibles sous
  `$ARKA_NORN_HOME/.arka-norn/workers/`. Elles ne sont pas source de vérité
  portable et un PID stale ou réutilisé ne permet jamais d’envoyer un signal à
  un autre processus.
- Le broker de permissions est deny-by-default. Seules les actions dont
  l’assistant expose un chemin structuré et vérifiable dans la racine Feature
  peuvent être préautorisées ; shell, sous-processus et réseau restent
  interdits. Une demande opaque est refusée avec
  `permission_not_preapproved`, jamais convertie en grant par `approve`.
  Codex ACP et Kimi Code ACP n’exposent pas encore ce contrat pour une écriture
  Feature : ils ne sont donc pas éligibles à une écriture automatique.
- Même lorsqu’une mission couvre toute la Feature, `.arka-norn/**` et
  `.git/**` restent hors de portée du worker. `Glob` et `Grep` exigent un
  chemin relatif explicite et refusent les motifs seuls, traversals, chemins
  absolus et liens symboliques qui sortent de la Feature.
- Avant le dispatch et avant `running`, le worker revalide le même
  `MissionOrder`. Une réussite exige à la fois un marqueur de preuve lié à
  l’exécution, une transition Pipeline et un document valide nouveau de
  l’étape attendue signé par l’Agent lié au provider sélectionné ; la sortie
  brute provider n’est jamais mise dans le registre.
- Le worker vérifie l’ordre de mission immuable contre le Project, la Feature,
  les chemins, le Pipeline et la prochaine étape actuels. Un écart est refusé :
  il n’est jamais « corrigé » par un élargissement de périmètre.
- Le workspace Mastra n’est pas une sandbox. L’adapter démarre un environnement
  temporaire minimal et n’hérite ni les variables arbitraires ni les
  identifiants ambiants. Un identifiant d’assistant explicitement fourni est
  transmis seulement au processus concerné, en mémoire ; il est absent du
  `MissionOrder`, du JSON worker, des logs et des registres. Cela ne remplace
  pas une isolation système ou conteneur. L’adapter Z.AI fixe son endpoint ; le
  Project ne peut pas lui en injecter un autre. Le libellé Kimi Platform
  s’appuie sur Kimi Code ACP, sans promettre une connexion directe à l’API
  Platform.
- Avant le dispatch, l’utilisateur confirme une cible assistant/modèle et une
  empreinte d’aperçu calculée par Arka. La politique peut recommander un
  candidat, mais ne se substitue pas à cette confirmation. Aucun fallback n’est
  autorisé après le début d’une exécution et aucune suite ne se lance sans un
  nouvel aperçu. Codex ACP et Kimi Code ACP relancent une nouvelle exécution
  après interruption ; ils ne promettent pas une reprise générique de session.
- Les missions d’audit sont dérivées en lecture seule : le worker Claude ne
  reçoit ni `Edit` ni `Write`, et le broker refuse ces opérations. Leur sortie
  libre n’est jamais ajoutée au registre, au journal ou au statut JSON ; seule
  une conclusion fermée sans secret est conservée, suivie d’une validation
  humaine obligatoire du document Pipeline.
- La récupération d’un worker abandonné utilise seulement son heartbeat privé,
  au prochain acte explicite. Elle le marque `interrupted` ou `rejected` après
  expiration et ne signale jamais le PID mémorisé.
- L’annulation lance les workers dans un groupe de processus dédié sous POSIX
  et termine ce groupe ; sous Windows, le repli Node ne garantit que le worker
  direct. Aucun PID privé persistant n’est utilisé pour cette terminaison.
- Les smoke tests d’assistants réels sont opt-in et exigent un identifiant local
  explicitement fourni. La CI utilise des doubles sans identifiant réel ; aucun
  test de release ne lit un secret depuis le Project ou les registres.

`arka-norn doctor --repair` ne modifie rien. Ajouter `--apply` pour isoler l’index corrompu dans un backup puis le réinitialiser. Le diagnostic couvre aussi markers, locks, audit trail, toutes les sessions Agents, contexte Project courant et installation locale des skills. Une skill `core` absente ou divergente est un échec ; seules les skills de profils spécialisés encore absentes restent des avertissements. `arka-norn skills doctor --global` ajoute le contrôle des installations Claude/Codex du profil utilisateur.
