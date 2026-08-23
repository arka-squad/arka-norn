# Reprise, comparaison et export

Un audit interrompu conserve son identifiant et ouvre une nouvelle tentative. `audit resume` exige le même Project, le même commit, le même scope et le même fingerprint de workspace. Les modules locaux terminés peuvent alors être conservés; les collectes connectées et dynamiques ne sont pas réutilisées implicitement.

Si le dépôt a changé, préparer un nouvel audit. `audit compare <courant> --baseline <ancien>` classe les constats par empreinte stable en nouveaux, persistants, résolus, régressés ou changements de couverture.

La KB locale filtre les objets normalisés sans embeddings. `audit export` copie par défaut seulement `report.md` et `audit.json`. L’option explicite d’inclusion des preuves reste soumise à leur classification et ne doit jamais exporter de secret.
