# Our Museum ♥

A tiny 3D art museum where a couple walks around together, each as their own little avatar, looking at framed photos of the two of them. Three themed rooms lead to a hidden last room with a personal message behind a red curtain, with music and floating hearts along the way.

- **Visitors** sign in with Google. Each couple has its own link, and people only ever see the museums their email is invited to.
- **The curator** (you) uses **`/admin`** to create a museum per couple, upload their photos and videos, write their texts and message, choose their song and add the emails that may enter.
- **Two (or more) people** can be in the same museum at the same time. They dress up their avatars, walk around together in real time, hold hands, hug, sit on a bench to watch a video, and much more.

**Live site:** https://iliaspa.github.io/3D-museum-date/ · **Curator page:** https://iliaspa.github.io/3D-museum-date/admin/

Built with [three.js](https://threejs.org), [Vite](https://vite.dev) and [Firebase](https://firebase.google.com) (free Spark plan). The website itself is static and hosted on GitHub Pages.

---

## 1. Firebase setup (done)

The Firebase project **`our-museum-iliaspa`** is ready: its databases are in Belgium, its security rules are deployed, Google sign-in is on, and `iliaspa.github.io` and `localhost` may sign in. Its settings are in `src/firebase-config.js`.

If you ever move the site to another address (e.g. Netlify or your own domain), add that address in two places:
1. Firebase console → Authentication → **Settings → Authorized domains**.
2. Google Cloud console → APIs & Services → **Credentials → Browser key (auto created by Firebase) → Website restrictions** (see "The GitHub secret alert" below).

## 2. Make a museum for a couple (`/admin`)

1. Go to **https://iliaspa.github.io/3D-museum-date/admin/** and sign in with `iliasparaskevas3@gmail.com`.
2. Under **Museums**, type a name (e.g. "Maria & Nikos") and click **+ New museum**. It gets its own link, e.g. `…/3D-museum-date/?m=maria-nikos`. Greek names work too ("Μαρία & Νίκος" becomes `maria-nikos`). You can change the link name under *Texts*.
3. **Photos:** drag photos in, or click to choose them. JPG, PNG and iPhone HEIC all work, at any size. They're resized, compressed and stripped of location data in your browser before uploading. Choose the room first with "New photos go to…". Then give each photo a title, a date (any text, like "Summer 2021") and a caption; changes save by themselves. Use ← → to change the walking order. "Add 10 sample photos" fills a museum with placeholders, if you want to try things out.
4. **Videos:** choose a video (any phone video, including iPhone HEVC). Your browser converts it to a small MP4 that plays everywhere (up to 2 minutes, about 12 MB a minute). It hangs on the wall **in front of a bench** in the room you chose, and plays, with sound, when someone sits on that bench. Each room has benches for two videos; rooms grow longer if you add more.
5. **Guests:** add the couple's Google (Gmail) addresses. Use exactly the address they sign in with. Then send them **this museum's link** (shown there, with a Copy button). If you add an email that's already on the list, or that's already invited to another museum, you get a short notice.
6. **Texts:** the link name, the title on the start screen and **the personal message** in the hidden last room. Click **Save**.
7. **Music:** upload their song (MP3, up to 8 MB). Without one, a gentle music-box tune plays.
8. **Preview (and layout):** a floor plan, seen from above, built with the same code as the 3D museum, so it shows exactly where every photo, bench and video screen will be. Everything you change here saves by itself:
   - **Click a room** to rename it, change its wall and sign colours, make it wider or longer (8–30 m; a room still grows if its photos need more wall), move it earlier or later in the walk, or remove it. Its photos and videos move with it; a removed room's photos go to the room next to it. **+ Add room** adds one at the end.
   - **Drag a number** onto another room to move that photo there, or onto another photo to take its place. Drag a **▶** to move a video. Click a number to edit that photo.
   - **Walk through ↗** opens the real 3D museum. As the curator you can visit any museum, and you stay invisible to the couple unless you add your own email as a guest.

You can make as many museums as you like, one per couple, each with its own link, photos, videos, texts, song and guests. Nobody can enter a museum they're not invited to: the database refuses it, even if someone has the link. If an email is invited to several museums, that person picks one of *their* museums after signing in.

## 3. Playing together

- Both people open their museum's link on their phones or computers and sign in with Google.
- Before entering, each dresses up their avatar (a little character with bendable arms and legs, hands with fingers and a face that shows feelings):
  - **Body:** guy or girl, skin tone, eye colour.
  - **Hair:** 10 styles (incl. bald) in 11 colours, plus freckles, stubble, moustache or beard.
  - **Outfit:** sweater, T-shirt, hoodie or dress; trousers, shorts or skirt; shoe colour.
  - **Extras:** beanie, cap, bow, flower crown or crown; round glasses, shades or heart glasses; scarf, backpack, earrings or a heart.
  - 🎲 picks a random outfit.
- Inside, you see each other with name tags. The ♥ button sends hearts the other person sees, and hearts float up whenever you stand close together. **Walk side by side and you hold hands.**
- The chip under the room name shows who's with you. You'll see a short note when someone arrives or leaves.

| Controls | Desktop | Phone / tablet |
| --- | --- | --- |
| Walk | Arrow keys (hold Shift to run) | Left thumb anywhere on the left side, then slide (all the way to run) |
| Look around | Drag with the mouse; the wheel zooms | Swipe on the right side |
| Open a photo | **Space**, or click it / the caption card | Tap the photo or the caption card |
| Actions | Letters **A–Z** (😊 lists them) | The **😊** button |
| Photo viewer | ← → to browse, Esc to close | Swipe to browse, × or tap outside to close |

**The 26 actions.** Everyone in the museum sees them.

| | | | |
| --- | --- | --- | --- |
| **A** Applaud 👏 | **H** Hug 🤗 | **O** Oops: trip and fall | **V** Victory ✌️ |
| **B** Blush 😊 | **I** Ignore: turn away dramatically | **P** Puppy eyes 🥺 | **W** Wave 👋 |
| **C** Cry 😢 | **J** Jump | **Q** Quack 🦆 | **X** Nope ❌ |
| **D** Dance 💃 | **K** Kiss 😘 | **R** Rainbow 🌈 | **Y** Yawn 🥱 |
| **E** Eat with chopsticks 🍜 | **L** Laugh 😂 | **S** Sit on a nearby bench | **Z** Zombie walk 🧟 (press again to stop) |
| **F** Flip (backflip) | **M** Meow 🐱 | **T** Tickle | |
| **G** Giggle 🤭 | **N** Nap 😴 | **U** Uh-oh! 🤩 | |

- **Hug** and **Kiss** need you to be close and **facing each other**: the other person hugs back or blushes. From further away, H makes a heart with your hands and K blows a kiss.
- **Tickle** works when you're close: the other person falls down laughing. From further away you tickle the air.
- **Sit (S)** works next to a bench. If a video hangs in front of it, the camera glides to a cinema view and the video plays with sound (the music pauses). Walk, or press S again, to stand up. Two people can share a bench, and they hold hands.
- Dance, Nap and Sit last until you walk. Zombie walk lasts until you press Z again.

**Sign-in tip:** Google blocks sign-in inside Instagram/Facebook/TikTok's own browsers. If someone opens the link from a DM, they should tap ⋯ → *Open in Safari/Chrome*. The page explains this when it detects such a browser.

## 4. Privacy & what's free

- Photos, texts and guest lists live in Firebase (Firestore), protected by the rules in `firestore.rules`. Only the curator and that museum's guests can read a museum, and only the curator can change anything. Live positions (Realtime Database, `database.rules.json`) are readable only by that museum's guests. Even though the website is public, the photos are not.
- The settings in `src/firebase-config.js` are public by design. Every Firebase website ships them, and the rules do the protecting.
- **The GitHub secret alert:** GitHub flags the `apiKey` in `src/firebase-config.js` as a "Google API Key". That's expected. A Firebase web key identifies the project and has to be sent to every visitor's browser, so it can't be hidden, and on its own it can't read anything. It is also restricted: it only works from `iliaspa.github.io`, the Google sign-in pop-up and `localhost:5173`/`4173`, and only for sign-in and the databases. To close the alert: repository → **Security → Secret scanning** → the alert → **Close as → Won't fix**.
- On the free Spark plan this comfortably covers many couples. The limits are 1 GB of stored data (about 1,500 photos), 10 GB of downloads a month (about 1,500 museum visits; photos are cached on the device after the first visit) and 100 people online at once. No credit card is needed. If you ever hit a limit, the museum just pauses until the next day or month. It never charges you.
- Photos are stored inside the database rather than as files, so each is capped at 1600 px for full screen. That's sharp on phones and laptops.
- Videos use the same free storage (about 12 MB per minute of video), so keep them short and sweet. A handful of 1-minute videos per couple is fine.

## 5. Develop on your Mac

You need [Node.js](https://nodejs.org) 20.19 or newer.

```bash
npm install      # once
npm run dev      # http://localhost:5173 — uses the real Firebase project
```

Shared settings for all museums (avatar colours, walking speed, camera, frame style, graphics) are in `src/config.js`. Everything per couple is in `/admin`.

**Test on your iPhone:** easiest is the live site: push your change and open it on the phone. To test the local version over Wi-Fi instead, open the **Network** address `npm run dev` prints (e.g. `http://192.168.1.217:5173/`). To sign in from that address, add it in the two places listed in section 1: `192.168.1.217` under Authorized domains, and `http://192.168.1.217:5173/*` under the key's website restrictions.

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

Netlify also works (`netlify.toml` is included): run `npm run build`, drag `dist/` onto https://app.netlify.com/drop, then add the Netlify address in the two places listed in section 1.

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

(The look picker and the A–Z body animations apply to the built-in avatar. A .glb character keeps its own animations and shows the action bubbles.)

## 8. Project map

```
admin/index.html          the curator page
src/admin/                curator logic: admin.js (UI), store.js (database writes),
                          imageTools.js (resize/HEIC in the browser), videoTools.js (video
                          conversion in the browser), floorPlan.js (preview)
src/backend/              firebase.js (setup + Google sign-in), museumData.js (reading museums),
                          presence.js (live positions of everyone in the museum)
src/firebase-config.js    Firebase project settings + admin email
src/config.js             shared settings (avatar, controls, camera, frames, graphics)
src/museumConfig.js       shared settings + one museum's own texts/rooms
src/main.js               the visitor flow: preview → sign in → load museum → look → enter
src/game.js               renderer, main loop, your avatar, the others' avatars, photos nearby
src/world/                rooms, frames, video screens, the hidden room, hearts, effects, dust…
src/player/               avatars (+ looks, + other people's), actions A–Z (emotes.js), walking, camera
src/ui/                   start screen (+ look picker), HUD, caption card, photo viewer, letter
firestore.rules           who may read/write the museums (runs on Google's servers)
database.rules.json       who may read/write live positions
public/samples/           the 10 sample photos for "Add 10 sample photos"
public/audio/song.mp3     the default song
```

## 9. Troubleshooting

- **"…isn't on a guest list yet":** add that exact email in /admin → Guests (it's shown on screen).
- **"Google sign-in isn't switched on yet":** Firebase console → Authentication → Sign-in method → Google → on.
- **"This web address isn't allowed to sign in yet"** or **"…isn't allowed to use the museum's Firebase key":** add the address in the two places listed in section 1.
- **A photo won't upload:** the status line names the file and the reason. Very unusual formats may need exporting as JPEG first.
- **Slow on an older phone:** the game automatically lowers its resolution if it struggles. You can also lower `graphics.maxPixelRatio` to `1.5` in `src/config.js`.
