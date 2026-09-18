/* ==========================================================================
   Configuration du deploiement
   --------------------------------------------------------------------------
   server : adresse publique du serveur de jeu (Node.js).

     ''                              -> meme machine que le site.
                                        C est le cas en reseau local, quand
                                        server.js sert lui-meme les pages.

     'catan-xxxx.onrender.com'       -> site publie sur GitHub Pages et serveur
     'https://catan-xxxx.onrender.com'  de jeu heberge ailleurs. Les trois
     'wss://catan-xxxx.onrender.com'    ecritures sont acceptees.

   Le workflow GitHub Actions reecrit ce fichier au deploiement si la variable
   de depot CATAN_SERVER est definie (Settings > Secrets and variables >
   Actions > Variables). Sinon c est la valeur ci-dessous qui sert.

   Pour un essai ponctuel sans rien modifier, ajoutez ?server=... a l URL :
     https://stanmandel.github.io/Catan/?server=catan-xxxx.onrender.com
   ========================================================================== */
window.CATAN_CONFIG = {
  server: ''
};
