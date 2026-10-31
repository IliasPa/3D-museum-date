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
2. Under **Museums**, type a name (e.g. "Maria & Nikos") and click **+ New museum**. It gets its own link, e.g. `…/3D-museum-date/?m=maria-nikos`. Greek names work too ("Μαρία & Νίκος" becomes `maria-nikos`). You can change the link name in *Preview* → the **start** dot.
3. **Photos:** drag photos in, or click to choose them. JPG, PNG and iPhone HEIC all work, at any size. They're resized, compressed and stripped of location data in your browser before uploading. New photos fill the free spots room by room; drop them straight onto a room to put them there. The photos are grouped by room: give each a title, a date (any text, like "Summer 2021") and a caption; changes save by themselves. **Drag a photo by its picture** to change the order, or into another room. To delete one, drag it onto the **bin** (you get a few seconds to Undo). "Add 10 sample photos" fills a museum with placeholders, if you want to try things out.
4. **Videos:** choose a video: any phone video (including iPhone HEVC/HDR), any length. Your browser converts it to an MP4 that plays everywhere, of **at most 50 MB**: short videos get the best quality (about 12 MB a minute), longer ones a lower quality so they still fit (a 6-minute video comes out at about 30–45 MB in 960×540; past roughly 25 minutes a video can't fit). It works in Safari and Chrome; converting takes from a few seconds to a few minutes. It hangs on the wall **in front of a bench** in the room you chose, and plays, with sound, when someone sits on that bench. Each room has benches for two videos.
5. **Guests:** add the couple's Google (Gmail) addresses. Use exactly the address they sign in with. Then send them **this museum's link** (shown there, with a Copy button). If you add an email that's already on the list, or that's already invited to another museum, you get a short notice.
6. **Music:** upload their song (MP3, up to 8 MB). Without one, a gentle music-box tune plays.
7. **Preview:** a floor plan, seen from above, built with the same code as the 3D museum, so it shows exactly where every photo, bench and video screen will be. Every room has **fixed spots** for photos on all four walls (also on the back wall); they only move if you make the room bigger or smaller. Click anything to edit it right below the plan — everything saves by itself:
   - **A numbered spot:** green spots have a photo: you see it with its title, date and caption to edit (or delete). Red spots are free: drop or choose a photo to hang it exactly there. Drag a green spot onto another spot to move that photo (onto a green one, the two swap), or onto a room to put it in that room's first free spot.
   - **A room:** rename it, change its wall and sign colours, make it wider or longer (8–30 m), move it earlier or later in the walk, or remove it. Its photos and videos move with it; a removed room's photos go to the room next to it. **+ Add room** adds one at the end.
   - **The start dot:** the start screen: its title and subtitle, the language, the name in your list and the link name (and, at the bottom, deleting the museum).
   - **The last room:** the hidden room behind the curtain: switch it on or off, the sign above the curtain, its title, **your personal message** and the signature.
   - Drag a **▶** onto another room to move a video. **Walk through ↗** opens the real 3D museum. As the curator you can visit any museum, and you stay invisible to the couple unless you add your own email as a guest.

**Storage.** Everything is stored in Firebase's free plan: **1 GB in total, for all museums together**. The bar under the museum list shows how much is used. A photo takes about 1–1.4 MB (sharp wall and full-screen copies), a video up to 50 MB, a song up to 8 MB. So 1 GB holds, for example, 10 couples with 40 photos, 2 short videos and a song each.

You can make as many museums as you like, one per couple, each with its own link, photos, videos, texts, song and guests. Nobody can enter a museum they're not invited to: the database refuses it, even if someone has the link. If an email is invited to several museums, that person picks one of *their* museums after signing in.

## 3. Playing together

- Both people open their museum's link on their phones or computers and sign in with Google.
- Before entering, each dresses up their avatar in the **avatar studio** (a little character with bendable arms and legs, hands with fingers and a face that shows feelings). Drag the big preview to turn it; it zooms in on whatever you're changing, and every option is shown as a little picture of *your* avatar wearing it. Every colour has a few swatches plus **+** for any colour at all.
  - **Body:** guy or girl; regular, slim, cuddly or strong; height and head size sliders; 8 skin tones + 4 fantasy ones.
  - **Face:** 9 eye shapes (round, lashes, sparkly, sleepy, happy ^^, dots, big, hearts, cat) in any colour; 6 eyebrows; 8 mouths (incl. tongue, fangs, smirk); lipstick; rosy, heart or star blush; 4 noses; round, elf or big ears; stubble, moustache, beard, goatee or a curly moustache; freckles, a beauty spot, a plaster, a painted heart or glitter.
  - **Hair:** 22 styles (incl. quiff, curtains, pixie, wavy, space buns, side pony, top knot, locs) in any colour, with optional coloured highlights.
  - **Top:** 13 tops (sweater, T-shirt, hoodie, shirt, jacket, dress, tank top, turtleneck, dungarees, blazer, puffer, jersey, cardigan); 9 prints (heart, star, stripes, dots, checks, flowers, zigzag, rainbow); the top's and the print's colours.
  - **Bottom:** trousers, shorts, skirt, jeans, long skirt or cargo; sneakers, boots, high-tops, sandals, heels or bunny slippers; their colours.
  - **Hats:** 21 (incl. top hat, cowboy, party hat, halo, tiara, witch, Santa, bucket hat, horns, bear ears, chef) in any colour; 9 kinds of glasses (incl. aviators, cat-eye and a monocle).
  - **Extras:** 9 things for the neck (scarf, necklace, pearls, locket, bow tie, tie, bandana, flower lei, medal); studs, hoops, pearls, headphones or earmuffs; a backpack, angel / fairy / bat wings, a cape or a guitar; a cat, fox, bunny or devil tail; something to carry (heart balloon, rose, teddy, ice cream, coffee, bouquet, book, lollipop); one colour for scarves, bags and capes.
  - **Pet:** a cat, puppy, bunny, duckling or bear cub, in any colour, that trots after you (the others see it too).
  - 🎲 picks a random outfit, ↶ undoes.
- Change your mind during the visit? The **👕** button opens the same studio as a wardrobe; the other person sees the new look right away.
- Inside, you see each other with name tags. The ♥ button sends hearts the other person sees, and hearts float up whenever you stand close together. **Walk side by side and you hold hands.**
- The chip under the room name shows who's with you. You'll see a short note when someone arrives or leaves.

| Controls | Desktop | Phone / tablet |
| --- | --- | --- |
| Walk | Arrow keys (hold Shift to run) | Left thumb anywhere on the left side, then slide (all the way to run) |
| Look around | Drag with the mouse; the wheel zooms | Swipe on the right side |
| Open a photo | **Space**, or click it / the caption card | Tap the photo or the caption card |
| Watch a film full screen (while sitting at it) | **Space** (Space or Esc to go back) | Tap the film |
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
- **Sit (S)** works next to a bench. If a video hangs in front of it, the camera glides to a cinema view and the video plays with sound (the music pauses). Press **Space** (or tap the film) to watch it full screen; Space, Esc or × goes back to the bench and the film keeps playing. Walk, or press S again, to stand up. Two people can share a bench, and they hold hands.
- Dance, Nap and Sit last until you walk. Zombie walk lasts until you press Z again.

**Sign-in tip:** Google blocks sign-in inside Instagram/Facebook/TikTok's own browsers. If someone opens the link from a DM, they should tap ⋯ → *Open in Safari/Chrome*. The page explains this when it detects such a browser.

## 4. Privacy & what's free

- Photos, texts and guest lists live in Firebase (Firestore), protected by the rules in `firestore.rules`. Only the curator and that museum's guests can read a museum, and only the curator can change anything. Live positions (Realtime Database, `database.rules.json`) are readable only by that museum's guests. Even though the website is public, the photos are not.
- The settings in `src/firebase-config.js` are public by design. Every Firebase website ships them, and the rules do the protecting.
- **The GitHub secret alert:** GitHub flags the `apiKey` in `src/firebase-config.js` as a "Google API Key". That's expected. A Firebase web key identifies the project and has to be sent to every visitor's browser, so it can't be hidden, and on its own it can't read anything. It is also restricted: it only works from `iliaspa.github.io`, the Google sign-in pop-up and `localhost:5173`/`4173`, and only for sign-in and the databases. To close the alert: repository → **Security → Secret scanning** → the alert → **Close as → Won't fix**.
- On the free Spark plan this comfortably covers many couples. The limits are 1 GB of stored data (see **Storage** in section 2; the curator page shows how much is used), 10 GB of downloads a month (photos, songs and videos are cached on the device after the first visit; a video is only downloaded when its room is visited) and 100 people online at once. No credit card is needed. If you ever hit a limit, the museum just pauses until the next day or month. It never charges you.
- Photos are stored inside the database rather than as files, so each is capped at 1600 px for full screen. That's sharp on phones and laptops.
- Videos use the same free storage (up to 50 MB each) and the same 10 GB of monthly downloads, so a few short videos per couple go a long way.

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

(The avatar studio and the A–Z body animations apply to the built-in avatar. A .glb character keeps its own animations and shows the action bubbles.)

## 8. Project map

```
admin/index.html          the curator page
src/admin/                curator logic: admin.js (UI), store.js (database writes),
                          imageTools.js (resize/HEIC in the browser), videoTools.js (video
                          conversion in the browser), floorPlan.js (preview), sortable.js (drag & drop)
src/backend/              firebase.js (setup + Google sign-in), museumData.js (reading museums),
                          presence.js (live positions of everyone in the museum)
src/firebase-config.js    Firebase project settings + admin email
src/config.js             shared settings (avatar, controls, camera, frames, graphics)
src/museumConfig.js       shared settings + one museum's own texts/rooms
src/main.js               the visitor flow: preview → sign in → load museum → look → enter
src/game.js               renderer, main loop, your avatar, the others' avatars, photos nearby
src/world/                rooms, frames, video screens, the hidden room, hearts, effects, dust…
src/player/               avatars: avatar.js (body + animation), avatarParts.js (face, hair, clothes,
                          hats, extras), pet.js, looks.js (all the options + the look code), the
                          others' avatars; actions A–Z (emotes.js), walking, camera
src/ui/                   start screen, avatar studio (+ its preview and picture tiles), wardrobe,
                          HUD, caption card, photo viewer, film viewer, letter
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
