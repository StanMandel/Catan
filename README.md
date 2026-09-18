# Catan — jeu de société en réseau local

Réimplémentation web complète des *Colons de Catan* (jeu de base), jouable à
plusieurs sur le même réseau local : un lobby permet de créer ou rejoindre des
parties, puis tout le monde joue en temps réel dans le navigateur.

**Aucune dépendance à installer** : uniquement Node.js (le serveur WebSocket est
écrit à la main avec les modules natifs).

---

## Lancer le serveur

```bash
node server.js          # port 3000 par défaut
node server.js 8080     # autre port
```

Sous Windows, un double-clic sur `start.bat` fait la même chose.

Au démarrage, la console affiche les adresses à donner aux autres joueurs :

```
    Sur cet ordinateur :   http://localhost:3000

    Pour les autres joueurs du reseau local :
      http://192.168.1.24:3000   (Wi-Fi)
```

Chaque joueur du réseau ouvre cette adresse dans son navigateur. Rien à
installer de leur côté.

> **Pare-feu Windows** : à la première exécution, Windows demande d'autoriser
> Node.js sur les réseaux privés — répondez **Autoriser**. Sans cela, les autres
> machines ne pourront pas se connecter. Pour ouvrir le port manuellement :
> `netsh advfirewall firewall add rule name="Catan" dir=in action=allow protocol=TCP localport=3000`

---

## Déroulé d'une partie

1. **Accueil** — chacun choisit d'abord son pseudo, puis deux gros boutons :
   **Créer une partie** (en réseau, ou en solo contre 0 à 5 adversaires IA) et
   **Rejoindre une partie** (avec le code à 4 lettres du salon, ou dans la liste
   des parties du réseau, mise à jour automatiquement).
2. **Salon** — réglages de l'hôte :
   - points pour gagner (curseur de 8 à 20) ;
   - valeurs numériques réglables avec les flèches ▲ ▼ (maintenir pour défiler) ;
   - colonies et routes de départ (1 de chaque par défaut) ;
   - voleur amical (il ne prend jamais de cartes) ou seuil de main au-delà duquel il en prend (7 par défaut) ;
   - pièces par joueur (15 routes, 5 colonies, 4 villes par défaut) ;
   - plateau aléatoire ou non, 6 et 8 non adjacents ;
   - bouton **Mods** pour activer du contenu additionnel. Chaque mod d'événement a
     une chance de se déclencher à chaque lancer de dés, avec un grand message
     rouge chez tous les joueurs :
     - *Événement perturbant* (1 chance sur 15) : deux tuiles de la carte sont interverties (terrain et jeton) ;
     - *Nomade* (1 chance sur 15) : le voleur se déplace seul sur une tuile au hasard, sans rien voler (pas sur un 7) ;
     - *Mauvais augure* (1 chance sur 20) : le joueur le plus développé perd une pièce
       (route, colonie ou bateau ; jamais une ville, ni sa dernière construction).

   Carte à choisir avec les flèches ◀ ▶ au-dessus de l'aperçu du plateau (c'est
   exactement celui qui sera joué ; « Nouveau tirage » en génère un autre), avec
   un **indice d'équilibrage** sur 100 (ressources, numéros, ports), masqué par
   défaut et affiché à la demande.
   Ajout/retrait d'adversaires IA, discussion, bouton *prêt*.
   L'hôte lance la partie ; l'ordre des joueurs est tiré au sort et les couleurs
   sont attribuées automatiquement.
3. **Partie** — plateau interactif, panneau des joueurs, main de cartes,
   journal des actions et discussion. Sous le plateau : bouton 🤝 **Échanger**
   (banque et ports, ou proposition aux joueurs) à gauche des cartes, bouton
   🎲 **Lancer les dés** / ➜ **Terminer le tour** à droite. Une grande annonce
   « À vous de jouer ! » s'affiche quand c'est à vous de lancer les dés.

## Sauvegardes

- **Automatiques** : la partie est enregistrée dans `saves/` quelques secondes
  après chaque action, quand un salon se ferme et à l'arrêt du serveur (Ctrl+C).
  La sauvegarde automatique d'une partie terminée est supprimée.
- **Manuelles** : bouton 💾 *Sauvegarder* en haut de l'écran de jeu, ou
  *Sauvegarder et quitter* dans la fenêtre « Quitter la partie ».
- **Reprise** : *Créer une partie → Reprendre une partie*. Un salon de reprise
  s'ouvre : chaque joueur prend sa place (automatique pour le même navigateur),
  les places libres sont jouées par l'ordinateur, puis l'hôte relance.

---

## Règles implémentées (jeu de base complet)

**Plateau**
- 12 cartes (définies dans `src/maps.js`) :
  - *Classique* — 19 tuiles (4 forêts, 4 pâturages, 4 champs, 3 collines, 3 montagnes, 1 désert), 9 ports ;
  - *Grande île* — 30 tuiles, 2 déserts, 11 ports (5-6 joueurs) ;
  - *Continent* — très grande île de 61 tuiles, 5 déserts, 16 ports (4-6 joueurs) ;
  - *Le Lac* — l'île classique avec un lac central, un port sur ses rives ;
  - *Archipel* — trois îles de 10 tuiles séparées par la mer ;
  - *Fer à cheval* — une île en arc autour d'une baie ;
  - *Grand Désert* — deux déserts fixes au centre ;
  - *Atoll* — anneau de 30 tuiles autour d'un grand lagon, ports sur les deux rives ;
  - *Le Détroit* — deux continents séparés par un bras de mer, avec bateaux ;
  - *Le Volcan* — 37 tuiles, désert central cerné par les 6 montagnes (tuiles fixes) ;
  - *L'Étoile* — six péninsules étroites autour d'un cœur central ;
  - *Le Sablier* — deux triangles reliés par un goulet de deux tuiles.
- Les cartes peuvent fixer des tuiles : D désert, F forêt, P pâturage, C champ,
  H colline, M montagne (le mod *Événement perturbant* ne les déplace pas).
- Disposition aléatoire ou fixe, option « pas de 6 ni 8 adjacents ».
- Un plateau aléatoire est retiré jusqu'à être équilibré : au moins 70/100 en
  ressources, numéros et ports (indicateurs verts de l'indice d'équilibrage).
- Banque de 19 cartes par ressource, portée à 24 (Grande île, Archipel, Fer à
  cheval) ou 40 (Continent) sur les grandes cartes.
- Ports génériques 3:1 et spécialisés 2:1 répartis régulièrement sur les côtes.
- Règle de distance entre constructions.

**Mise en place**
- Placement en serpentin (1→n, n→1, …), une manche par colonie de départ ; les
  routes de départ sont réparties entre les colonies et partent de la colonie posée.
- La colonie de la dernière manche rapporte les ressources des tuiles adjacentes.

**Tour de jeu**
- Lancer des dés, production (villes = 2 ressources).
- Rupture de banque : si la banque ne peut pas servir tout le monde pour une
  ressource, personne ne la reçoit (sauf s'il n'y a qu'un seul bénéficiaire).
- Sur un **7** : chaque joueur ayant plus de 7 cartes (réglable) en perd la moitié,
  tirées au hasard ; puis déplacement du voleur et vol d'une carte à un joueur adjacent.
  Avec le **voleur amical**, le voleur bloque toujours sa tuile mais personne ne perd de cartes.
- **Bateaux** (carte Archipel) : 3 bois + 1 minerai + 1 blé. Depuis une construction
  sur la côte, le bateau accoste à un port d'une autre île ; le joueur peut ensuite
  construire des routes depuis ce port.
- La tuile occupée par le voleur ne produit plus.
- Dés : deux dés à 6 faces tirés indépendamment côté serveur. Équité vérifiée sur
  5 échantillons de 360 000 lancers (khi² conforme sur les sommes, sur chaque dé
  pris séparément et sur les 36 couples possibles).

**Abandon**
- Un joueur peut quitter la partie à tout moment. Ses constructions restent sur
  le plateau mais cessent de produire, on ne peut plus le voler, son tour est
  sauté, et la partie continue. S'il ne reste qu'un joueur, celui-ci gagne.

**Constructions**
- Route (1 argile + 1 bois), colonie (bois + argile + laine + blé),
  ville (2 blé + 3 minerai), carte développement (laine + blé + minerai).
- Limites : 15 routes, 5 colonies, 4 villes par joueur ; 19 cartes par ressource.
- Une route ne peut pas traverser une colonie adverse.

**Cartes développement (25)**
- 14 Chevaliers, 5 Points de victoire, 2 Construction de routes, 2 Invention,
  2 Monopole.
- Une seule carte jouable par tour, jamais celle achetée le tour même ;
  le Chevalier est jouable avant le jet de dés.

**Commerce**
- Banque 4:1, port générique 3:1, port spécialisé 2:1 (taux calculés selon les
  ports possédés).
- Échanges entre joueurs : proposition, acceptation, refus et
  **contre-proposition**, l'initiateur choisit son partenaire.

**Points de victoire**
- Colonie 1, ville 2, Route la plus longue (5+) 2, Armée la plus puissante
  (3 chevaliers) 2, carte point de victoire 1 (secrète jusqu'à la fin).
- La Route la plus longue tient compte des coupures par une colonie adverse et
  reste au détenteur en cas d'égalité.
- Victoire à 10 points (réglable de 8 à 20) pendant son propre tour.

---

## Écran de jeu

- **À gauche : « Que construire ? »** — route, colonie, ville et carte
  développement, illustrées par les pièces en bois, avec leur coût, ce qu'elles
  rapportent et votre stock restant. L'encadré passe au vert quand vous avez les
  ressources ; un clic active directement la pose sur le plateau. Le détail des
  règles de pose apparaît dans une bulle au survol de la souris.
- **Vos cartes** sont fixées en bas du plateau (ressources à gauche, cartes
  développement à droite) et restent visibles en permanence.
- **Bouton « Joueurs »** en haut à droite : fenêtre récapitulative de tous les
  joueurs (PV visibles, cartes, chevaliers, route la plus longue, pièces
  restantes, qui joue, qui est hors ligne ou a quitté).
- **Bouton « Quitter la partie »** : après confirmation, vous abandonnez la
  partie. Vos constructions restent sur le plateau mais ne produisent plus, les
  autres continuent sans vous, et vous revenez à l'accueil. Si un seul joueur
  reste en lice, il remporte la partie.
- Quand c'est votre tour, le bandeau du haut s'affiche en grand, en doré et
  clignotant doucement, et le socle de vos cartes s'entoure d'or.
- Journal des actions et discussion à droite, dés en haut à droite du plateau.

## Confort de jeu

- Reconnexion automatique : en cas de rafraîchissement ou de coupure, on
  retrouve sa place et sa main (identité mémorisée dans le navigateur). Un salon
  n'est supprimé qu'après 5 minutes sans aucun joueur connecté.
- L'hôte peut passer le tour d'un joueur hors ligne.
- Zoom et déplacement du plateau (molette, glisser, boutons +/−/⟳).
- Aide « Règles & coûts » accessible à tout moment.

---

## Structure du projet

```
server.js            serveur HTTP + WebSocket, lobby, salons, reconnexion
src/ws-server.js     implémentation WebSocket (RFC 6455) sans dépendance
src/maps.js          définition des cartes (dessinées en texte)
src/board.js         géométrie du plateau, tuiles, jetons, ports
src/game.js          moteur de règles (autoritaire côté serveur)
src/bot.js           adversaires IA (joués côté serveur)
src/balance.js       indice d'équilibrage d'un plateau
src/mods.js          registre des mods (contenu additionnel, crochets de partie)
public/index.html    interface (accueil, salon, partie)
public/css/style.css thème bois/parchemin
public/img/          photos des pièces (route, colonie, ville, carte)
public/js/net.js     client WebSocket et reconnexion
public/js/board.js   rendu SVG du plateau (tuiles dessinées, jetons, pions)
public/js/ui.js      logique d'interface, modales, échanges
```

Le serveur est **autoritaire** : le client n'envoie que des intentions, toutes
les règles sont validées côté serveur, et chaque joueur ne reçoit que sa propre
main (les cartes des autres restent cachées).

## Nombre de joueurs

Le jeu original se joue à 3-4 joueurs ; c'est la configuration recommandée.
Pour 5-6 joueurs, choisissez la carte *Grande île*. Les places vides peuvent
être complétées par des adversaires IA, et l'on peut aussi lancer une partie
seul (sans adversaire) pour s'entraîner.
