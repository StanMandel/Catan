# Mettre Catan en ligne

## Pourquoi deux hebergements

GitHub Pages ne sert que des fichiers statiques : il ne sait pas executer
Node.js, ni tenir une WebSocket ouverte, ni garder l etat d une partie en
memoire. Or toute la logique du jeu vit dans `src/game.js`, cote serveur.
Publier le depot sur Pages tel quel ne donnerait qu un plateau vide.

Le deploiement se fait donc en deux morceaux :

```
  https://stanmandel.github.io/Catan/        GitHub Pages
  le site : HTML, CSS, JS, images, sons      (statique, gratuit)
                    |
                    |  wss://   WebSocket
                    v
  https://catan-serveur.onrender.com         Render (ou Koyeb, Fly.io...)
  le serveur : parties, joueurs, bots        (Node.js, gratuit)
```

Le client sait vers quel serveur se tourner grace a `public/js/config.js`.

---

## 1. Heberger le serveur de jeu

Sur [render.com](https://render.com) : **New > Blueprint**, choisir ce depot.
Render lit `render.yaml` et configure tout seul le service (Node 20, demarrage
`node server.js`, sonde de sante `/healthz`).

N importe quel hebergeur Node fait l affaire — Koyeb, Fly.io, Railway — du
moment qu il supporte les WebSockets. Le serveur n a **aucune dependance** :
il suffit de lancer `node server.js`. Il lit le port dans `process.env.PORT`.

Notez l adresse obtenue, par exemple `catan-serveur.onrender.com`.

## 2. Autoriser votre site a s y connecter

Toujours chez l hebergeur, definir la variable d environnement :

```
ALLOWED_ORIGINS = https://stanmandel.github.io
```

L origine seule, **sans le chemin `/Catan/` ni barre finale**. Plusieurs
valeurs se separent par des virgules :

```
ALLOWED_ORIGINS = https://stanmandel.github.io,http://localhost:3000
```

Sans cette variable le serveur accepte toutes les origines — pratique en
reseau local, a eviter une fois en ligne : n importe quel autre site pourrait
faire jouer vos visiteurs sur votre serveur a leur insu.

Le serveur accepte toujours sa propre origine, donc
`https://catan-serveur.onrender.com` reste jouable directement.

## 3. Publier le site

Dans le depot GitHub :

1. **Settings > Pages > Source : GitHub Actions**
2. **Settings > Secrets and variables > Actions > Variables > New variable**
   - Nom : `CATAN_SERVER`
   - Valeur : `catan-serveur.onrender.com`

Le workflow `.github/workflows/pages.yml` publie `public/` a chaque push sur
`main` et reecrit `config.js` avec cette adresse. Si la variable est absente,
le deploiement reussit quand meme mais affiche un avertissement, et le
multijoueur ne fonctionnera pas.

Vous pouvez aussi ecrire l adresse en dur dans `public/js/config.js` et la
commiter — la variable de depot evite simplement de la versionner.

## 4. Verifier

| Verification | Attendu |
|---|---|
| `curl https://catan-serveur.onrender.com/healthz` | `{"ok":true,...}` |
| Ouvrir le site, coin haut droit | « Connecté » en vert |
| Console du navigateur : `Net.serverUrl()` | `wss://catan-serveur.onrender.com` |

Pour tester une autre adresse sans rien redeployer, ajoutez `?server=` a l URL :

```
https://stanmandel.github.io/Catan/?server=autre-serveur.onrender.com
```

---

## Ce qu il faut savoir sur les offres gratuites

**Le serveur s endort.** Chez Render, apres 15 minutes sans visite, le service
est mis en veille ; la connexion suivante peut demander jusqu a une minute. Le
client gere ce cas : il reessaie tout seul et affiche « Réveil du serveur… ».
Pour l eviter, un pingeur externe (UptimeRobot par exemple) sur `/healthz`
toutes les 10 minutes suffit.

**Les sauvegardes ne survivent pas a un redemarrage.** Le disque est ephemere :
`saves/` est vide a chaque redeploiement ou sortie de veille. Les parties en
cours en memoire ne sont pas affectees tant que le serveur tourne. Pour des
sauvegardes durables, montez un disque persistant chez l hebergeur et pointez
`SAVE_DIR` dessus :

```
SAVE_DIR = /var/data/saves
```

**Les parties sont visibles de tous.** La liste des salons est publique : tout
visiteur du site voit les parties en cours et peut les rejoindre. Pour une
partie entre amis, mettez un mot de passe de salon a la creation.

---

## Le reseau local continue de marcher

Rien n a change pour jouer chez soi : `node server.js`, et le serveur sert
lui-meme le site. `config.js` avec `server: ''` fait pointer le client sur sa
propre origine, et sans `ALLOWED_ORIGINS` aucun filtrage ne s applique.

## En cas de probleme

| Symptome | Cause probable |
|---|---|
| Bloque sur « Reconnexion… » | `CATAN_SERVER` absent ou mal orthographie : le site cherche le serveur sur `github.io`. Verifiez avec `Net.serverUrl()` dans la console. |
| « Réveil du serveur… » qui dure | Sortie de veille normale (jusqu a 1 min). Au-dela, le serveur est probablement arrete chez l hebergeur. |
| Erreur 403 dans l onglet Réseau | L origine du site ne figure pas dans `ALLOWED_ORIGINS`. Comparez au caractere pres : `https://` et pas de barre finale. |
| « mixed content » dans la console | Le site est en HTTPS et vise un serveur en `ws://`. Le client corrige en `wss://`, mais l hebergeur doit fournir le HTTPS. |
| Sauvegardes disparues | Disque ephemere : voir `SAVE_DIR` ci-dessus. |
