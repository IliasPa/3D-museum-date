# Our Museum ♥

A tiny 3D art museum where a couple walks around together, each as their own little avatar, looking at framed photos of the two of them. Three themed rooms lead to a hidden last room with a personal message behind a red curtain, with music and floating hearts along the way.

- **Visitors** sign in with Google. They only get in if their email is on that couple's guest list.
- **The curator** (you) uses **`/admin`** to create a museum per couple, upload their photos, write their texts and message, choose their song and add the emails that may enter.
- **Two (or more) people** can be in the same museum at the same time. They see each other walk around in real time, and can send ♥.

**Live site:** https://iliaspa.github.io/3D-museum-date/ · **Curator page:** https://iliaspa.github.io/3D-museum-date/admin/

Built with [three.js](https://threejs.org), [Vite](https://vite.dev) and [Firebase](https://firebase.google.com) (free Spark plan). The website itself is static and hosted on GitHub Pages.

---

## 1. One-time Firebase setup

The Firebase project **`our-museum-iliaspa`** already exists: its databases are in Belgium, its security rules are deployed, and its settings are in `src/firebase-config.js`. Only Google sign-in has to be switched on by hand (Google requires the console for this):

1. Open https://console.firebase.google.com/project/our-museum-iliaspa/authentication and click **Get started**.
2. Under **Sign-in method**, choose **Google**, switch it **on**, pick your email as the support email, then click **Save**.
3. Open **Settings → Authorized domains → Add domain**, enter `iliaspa.github.io`, then click **Add**. (`localhost` is already there, for testing on your Mac.)

That's it. Open the curator page and sign in.

## 2. Make a museum for a couple (`/admin`)

1. Go to **https://iliaspa.github.io/3D-museum-date/admin/** and sign in with `iliasparaskevas3@gmail.com`.
2. Under **Museums**, type a name (e.g. "Maria & Nikos") and click **+ New museum**.
3. **Photos:** drag photos in, or click to choose them. JPG, PNG and iPhone HEIC all work, at any size. They're resized, compressed and stripped of location data in your browser before uploading. Choose the room first with "New photos go to…". Then give each photo a title, a date (any text, like "Summer 2021") and a caption; changes save by themselves. Use ← → to change the walking order. "Add 10 sample photos" fills a museum with placeholders, if you want to try things out.
4. **Guests:** add the couple's Google (Gmail) addresses. Use exactly the address they sign in with. Then send them the link shown there.
5. **Texts & rooms:** the title on the start screen, room names and colours (add or remove rooms), and **the personal message** in the hidden last room. Click **Save**.
6. **Music:** upload their song (MP3, up to 8 MB). Without one, a gentle music-box tune plays.
7. **Preview:** a light floor plan showing where every photo hangs (click a number to edit that photo). **Walk through ↗** opens the real 3D museum. As the curator you can visit any museum, and you stay invisible to the couple unless you add your own email as a guest.

You can make as many museums as you like, one per couple, each with its own photos, texts, song and guests. If an email is invited to several museums, that person picks one after signing in.

## 3. Playing together

- Both people open the link on their phones or computers and sign in with Google.
- Before entering, each picks a look: sweater, hair colour, skin tone and hairstyle (short, long or bun).
- Inside, you see each other with name tags. The ♥ button (top right) sends a burst of hearts the other person sees, and hearts float up whenever you stand close together.
- The chip under the room name shows who's with you. You'll see a short note when someone arrives or leaves.

| Controls | Desktop | Phone / tablet |
| --- | --- | --- |
| Walk | WASD or arrow keys (hold Shift to run) | Left thumb anywhere on the left side, then slide (all the way to run) |
| Look around | Drag with the mouse; the wheel zooms | Swipe on the right side |
| Open a photo | Click it, click the caption card, or press E | Tap the photo or the caption card |
| Photo viewer | ← → to browse, Esc to close | Swipe to browse, × or tap outside to close |

**Sign-in tip:** Google blocks sign-in inside Instagram/Facebook/TikTok's own browsers. If someone opens the link from a DM, they should tap ⋯ → *Open in Safari/Chrome*. The page explains this when it detects such a browser.

## 4. Privacy & what's free

- Photos, texts and guest lists live in Firebase (Firestore), protected by the rules in `firestore.rules`. Only the curator and that museum's guests can read a museum, and only the curator can change anything. Live positions (Realtime Database, `database.rules.json`) are readable only by that museum's guests. Even though the website is public, the photos are not.
- The settings in `src/firebase-config.js` are public by design. Every Firebase website ships them, and the rules do the protecting.
- On the free Spark plan this comfortably covers many couples. The limits are 1 GB of stored data (about 1,500 photos), 10 GB of downloads a month (about 1,500 museum visits; photos are cached on the device after the first visit) and 100 people online at once. No credit card is needed. If you ever hit a limit, the museum just pauses until the next day or month. It never charges you.
- Photos are stored inside the database rather than as files, so each is capped at 1600 px for full screen. That's sharp on phones and laptops.

## 5. Develop on your Mac

You need [Node.js](https://nodejs.org) 20.19 or newer.

```bash
npm install      # once
npm run dev      # http://localhost:5173 — uses the real Firebase project
```

Shared settings for all museums (avatar colours, walking speed, camera, frame style, graphics) are in `src/config.js`. Everything per couple is in `/admin`.

**Test on your iPhone over Wi-Fi:** with `npm run dev` running, open the **Network** address it prints (e.g. `http://192.168.1.217:5173/`) in Safari on the same Wi-Fi network. To sign in from that address, add your Mac's IP (e.g. `192.168.1.217`) to Firebase → Authentication → Settings → Authorized domains. Or simply test on the live site.

**Offline testing with fake accounts:** `npm run emulators` (needs Java 21) plus, in a second terminal, `npm run dev:emulator`. This runs a local copy of Firebase with throw-away data. In the browser console, `__testSignIn('anyone@example.com')` signs you in as anyone.

**Changed the rules?** Run `npm run deploy:rules` (uses the Firebase CLI, logged in as you).

**Admin email:** it's listed in three places, `src/firebase-config.js`, `firestore.rules` and `database.rules.json`. Change all three, then run `npm run deploy:rules`.

## 6. Put changes online

The site redeploys to GitHub Pages automatically on every push to `main` (see `.github/workflows/deploy.yml`):

```bash
git add .
git commit -m "Describe your change"
git push
```

Wait about a minute (watch the repository's **Actions** tab). Photos, texts, guests and music don't need a deploy: they're edited live in `/admin`.

Netlify also works (`netlify.toml` is included): run `npm run build`, drag `dist/` onto https://app.netlify.com/drop, then add the Netlify address to Firebase → Authentication → Settings → Authorized domains.

## 7. Use your own avatar (e.g. from Mixamo)

The built-in avatar is made of simple shapes, and you can switch everyone to a real 3D character:

1. On [mixamo.com](https://www.mixamo.com), pick a character and download these animations as **FBX**:
   - *Idle*, **With Skin**
   - *Walking*, **Without Skin**, with **In Place** ticked
   - *Running* (optional), **Without Skin**, with **In Place** ticked
2. In [Blender](https://www.blender.org) (free), File → Import → FBX the *Idle* file first. Then import the other two the same way.
3. Click the character's skeleton (armature) and open the **Action Editor**. Every imported clip appears in its action list. Rename them to `idle`, `walk` and `run`, and click the 🛡 (*Fake User*) button on each.
4. Delete the extra skeletons that the walk/run imports created.
5. File → Export → **glTF 2.0 (.glb)**. Under *Animation*, choose mode **Actions**.
6. Save it as `public/models/avatar.glb` (create the `models` folder).
7. In `src/config.js` set `avatar.type: 'glb'`. If the model walks backwards, set `rotationY: Math.PI`.

(The look picker's colours only apply to the built-in avatar.)

## 8. Project map

```
admin/index.html          the curator page
src/admin/                curator logic: admin.js (UI), store.js (database writes),
                          imageTools.js (resize/HEIC in the browser), floorPlan.js (preview)
src/backend/              firebase.js (setup + Google sign-in), museumData.js (reading museums),
                          presence.js (live positions of everyone in the museum)
src/firebase-config.js    Firebase project settings + admin email
src/config.js             shared settings (avatar, controls, camera, frames, graphics)
src/museumConfig.js       shared settings + one museum's own texts/rooms
src/main.js               the visitor flow: preview → sign in → load museum → look → enter
src/game.js               renderer, main loop, your avatar, the others' avatars, photos nearby
src/world/                rooms, frames, the hidden room, hearts, dust, textures, collisions
src/player/               avatars (+ looks, + other people's), walking, camera
src/ui/                   start screen (+ look picker), HUD, caption card, photo viewer, letter
firestore.rules           who may read/write the museums (runs on Google's servers)
database.rules.json       who may read/write live positions
public/samples/           the 10 sample photos for "Add 10 sample photos"
public/audio/song.mp3     the default song
```

## 9. Troubleshooting

- **"…isn't on a guest list yet":** add that exact email in /admin → Guests (it's shown on screen).
- **"Google sign-in isn't switched on yet":** do step 1 above.
- **"This web address isn't allowed to sign in yet":** add the address under Authentication → Settings → Authorized domains.
- **A photo won't upload:** the status line names the file and the reason. Very unusual formats may need exporting as JPEG first.
- **Slow on an older phone:** the game automatically lowers its resolution if it struggles. You can also lower `graphics.maxPixelRatio` to `1.5` in `src/config.js`.
