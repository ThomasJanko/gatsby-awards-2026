# 🎩 Gatsby Awards 2026

Jeu de soirée : une TV affiche des catégories absurdes, chaque invité vote **anonymement** depuis son téléphone pour quelqu'un, puis on révèle le gagnant en direct.

**Stack :** React 19 + TypeScript + Tailwind v4 (Vite) · Node + Express + Socket.io · état en mémoire.

## Lancer

```bash
npm install

# Mode soirée (un seul port, recommandé le jour J)
npm run build
npm start              # → http://<IP-du-PC>:3000

# Mode dev (hot reload) : front sur 5173, serveur sur 3000
npm run dev
```

Le terminal affiche les adresses réseau (ex. `http://192.168.1.20:3000`).

### Le soir J

1. **TV** (navigateur de la TV, ou PC branché en HDMI) : ouvre `http://<IP>:3000/tv`. Un code écran à 4 chiffres et un QR code s'affichent.
2. **Ton téléphone (organisateur)** : scanne ce QR code. Il ouvre `/orga` et associe la TV automatiquement. Tu peux aussi ouvrir `/orga` et taper le code écran dans « Écran TV ». Entre ton nom, puis « Créer la soirée ».
3. La TV affiche alors le **code de la soirée** et le QR pour les invités, qui entrent juste un pseudo.
4. Tu pilotes tout depuis ton téléphone. La barre « Régie » en bas sert à lancer, révéler, passer au prix suivant ou rejouer. Le bouton « Réglages » donne accès à l'écran TV, à l'affichage du code pour un retardataire, à la gestion des invités, à la fin de partie et à la fermeture de la soirée. Tu votes aussi, comme les autres.

La TV est **100 % passive** : aucun bouton n'y pilote le jeu (seule la touche F met en plein écran). Si on tape le code de la soirée au clavier sur l'écran d'appairage, elle l'affiche aussi.

> Tout le monde doit être sur le **même Wi-Fi**. Si l'écran est ouvert en `localhost`, les QR codes utilisent automatiquement l'IP réseau du PC.

## Sécurité des rôles

- À la création, le serveur génère un **hostToken** secret, stocké uniquement sur le téléphone de l'orga. Seul un socket qui présente ce token peut piloter.
- Personne ne peut reprendre le rôle d'organisateur, ni via son pseudo ni via son identifiant.
- Si ton téléphone se verrouille ou que la page est rechargée, tu reprends la main automatiquement. Même chose pour la TV, qui retourne dans la soirée.

## Déroulé

`lobby` → `question` (votes) → `reveal` (roulement de tambour, lauréat, confettis, barres) → … → `podium` (palmarès et Gatsby de l'année).

- Les votes sont modifiables jusqu'à la révélation, et les égalités donnent des ex æquo.
- **Anonymat :** le lien votant → cible ne quitte jamais le serveur. La TV ne reçoit que le décompte, chaque téléphone uniquement son propre vote.

## Personnaliser

| Quoi | Où |
|---|---|
| Questions | `server/questions.ts` |
| Nombre de prix par partie | réglable depuis le téléphone orga (défaut : `QUESTIONS_PER_GAME`, 15) |
| Port | variable d'env `PORT` (défaut 3000) |
| Couleurs / polices | `src/index.css` (`@theme`) |
| Durée du suspense | `SUSPENSE_MS` dans `src/tv/TvApp.tsx` |
| Polices | `@fontsource-variable/*`, embarquées (aucune dépendance à internet) |

## Structure

```
server/
  index.ts       Express + Socket.io, diffusion personnalisée de l'état
  rooms.ts       logique de jeu pure (machine à états, votes, palmarès)
  questions.ts   les catégories
shared/types.ts  types des événements & de l'état (client ↔ serveur)
src/
  tv/TvApp.tsx         écran TV (passif, appairage)
  player/PlayerApp.tsx écran mobile (invités + création de soirée)
  player/Host.tsx      régie de l'organisateur
  socket.ts, ui.tsx    socket typé, hooks, composants
```

## Héberger en ligne (optionnel)

C'est un seul process Node avec WebSocket : Railway, Render ou Fly.io conviennent (`npm run build` puis `npm start`). Vercel ne convient pas pour le serveur WebSocket.
