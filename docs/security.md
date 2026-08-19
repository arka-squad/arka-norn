# Sécurité locale

Sont non fiables : roots fournis, markers, symlinks, noms, JSON, environnement, processus concurrents, skills existants et sorties externes.

- Les roots sont absolus, canonisés par `realpath` et comparés avec `path.relative`.
- Les roots et zones sensibles symboliques sont refusés.
- `marker.root` doit correspondre à son emplacement réel.
- Une Feature doit être strictement contenue dans son Project.
- Les JSON sont bornés à 2 Mio et lus via `lstat`.
- Les index/logs privés utilisent `0600`; les markers portables `0644`.
- Les locks ont timeout et détection de stale lock.
- Les install/scaffold refusent l’écrasement implicite.
- Aucun shell n’est utilisé pour piloter la TUI ou les cas d’usage.

`arka-norn doctor --repair` ne modifie rien. Ajouter `--apply` pour isoler l’index corrompu dans un backup puis le réinitialiser. Les scans explicites reconstruisent ensuite les index depuis les markers valides.
