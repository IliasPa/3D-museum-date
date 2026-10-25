# Our Museum ♥

A tiny 3D art museum you walk through with a cute avatar, looking at framed photos of the two of you.
Three themed rooms, a hidden last room with your message behind a red curtain, music, floating hearts.

Built with [three.js](https://threejs.org) and [Vite](https://vite.dev). It's a static site with no server or database, and it runs on iPhone Safari, Android Chrome and desktop browsers.

---

## 1. Run it

You need [Node.js](https://nodejs.org) 20.19 or newer (22 LTS recommended).

```bash
npm install      # once
npm run dev      # start the local server
```

Open the **Local** address it prints (http://localhost:5173). While `npm run dev` is running, every time you save a file the browser reloads by itself, and that includes adding photos or editing `photos.json`.

| Controls | Desktop | Phone / tablet |
| --- | --- | --- |
| Walk | WASD or arrow keys (hold Shift to run) | Put your left thumb anywhere on the left side and slide (push all the way to run) |
| Look around | Drag with the mouse; the wheel zooms | Swipe on the right side |
| Open a photo | Click it, click the caption card, or press E / Enter / Space | Tap the photo or the caption card |
| Photo viewer | ← → to browse, Esc to close | Swipe left/right to browse, × or tap outside to close |

## 2. Test on your iPhone over Wi-Fi

1. Connect your Mac and iPhone to **the same Wi-Fi network**.
2. Run `npm run dev` on the Mac. Next to **Network** it prints an address like `http://192.168.1.217:5173/`.
3. On the iPhone, open **Safari** and type that address exactly, starting with `http://`.
4. Tap **Enter**. The music starts (turn the volume up; it plays even with the silent switch on).

If the page doesn't load on the phone:

- **macOS firewall:** the first time, macOS may ask whether *node* may accept incoming connections. Click **Allow**. If you clicked Deny, go to System Settings → Network → Firewall → Options and allow `node`.
- **Guest or office Wi-Fi** networks often block devices from talking to each other. Use your home network or your phone's hotspot.
- **The address changed:** your Mac's IP can change from day to day, so use whatever `npm run dev` prints. You can also find it with `ipconfig getifaddr en0`.
- **VPN:** turn it off on both devices.

Optional extras:

- **Full-screen like an app:** in Safari tap Share → **Add to Home Screen**, then open it from the icon.
- **See errors from the phone:** on the iPhone go to Settings → Safari → Advanced → turn on **Web Inspector**. Then on the Mac, open Safari → Develop menu → your iPhone → the page. (Enable the Develop menu under Safari → Settings → Advanced.)

Android works the same way with Chrome.

## 3. Make it yours

### Photos: `photos/` and `photos/photos.json`

1. Copy your photos into the `photos/` folder. Any size is fine, and JPG, PNG, WebP and **iPhone HEIC** are all supported.
2. List them in `photos/photos.json`, in the order you want to walk past them:

```json
[
  {
    "file": "first-date.jpg",
    "room": 1,
    "title": "Our first date",
    "date": "May 2019",
    "caption": "Two coffees, three hours, zero awkward silences."
  },
  {
    "file": "IMG_4521.HEIC",
    "room": 2,
    "title": "Naxos",
    "date": "August 2021",
    "caption": "The sunset you made me wait an hour for. Worth it."
  }
]
```

| Field | Meaning |
| --- | --- |
| `file` | File name inside `photos/` (exact spelling, including upper/lower case) |
| `room` | `1`, `2`, `3`… the room it hangs in, matching the order of `rooms` in `src/config.js` |
| `title`, `date`, `caption` | Shown on the caption card and in the full-screen view. `date` is free text ("Summer 2020" works). Leave any of them as `""` to hide it. |

**Lots of photos?** Drop them all in `photos/`, then run `npm run photos -- --add-new`. Every photo that isn't listed yet gets added to `photos.json`, and you then fill in the texts and room numbers.

**JSON tips:** texts go in "double quotes", entries are separated by commas, and there's **no comma after the last one**. If you make a typo, the terminal tells you what's wrong.

**What happens automatically:** every photo is resized and compressed into a 1024 px version (for the wall) and a 2048 px version (for the full-screen view, downloaded only when opened). Location and camera data (EXIF/GPS) are removed, and phone orientation is fixed. The results go to `public/gallery/`; don't edit that folder by hand.

Photos are placed around each room automatically, and a room grows bigger if you give it many photos. Somewhere between 6 and 15 photos per room feels best. For more, add another room.

### Texts, rooms and colours: `src/config.js`

Everything personal is in this one file, with comments:

- `title`, `subtitle`: the start screen and the welcome sign on the first room's back wall
- `language`: set it to `'el'` if you write your texts in Greek. Greek letters are fully supported; this makes CAPITALS drop their accents correctly.
- `rooms`: room names, wall colours and accent colours. Add or remove entries to change the number of rooms.
- `finale.message`: **your personal message** in the hidden last room. Line breaks are kept. `finale.signature` and `finale.doorSign` (the text above the curtain) are there too.
- `avatar.colors`: skin, hair, sweater, trousers, shoes and blush colours of the avatar
- `controls`, `camera`, `frames`: walking speed, camera distance, frame size and style (`walnut`, `gold`, `black` or `white`)

### Music: `public/audio/song.mp3`

Replace this file with your song, keeping the name `song.mp3`. (Or put your file in `public/audio/` and change `music.src` in the config.) The included song is a placeholder music-box tune. MP3 at 128 kbps is plenty, and a 3-minute song is about 3 MB. If the file is missing, the game simply plays without music and hides the mute button.

### Use your own avatar (e.g. from Mixamo)

The built-in avatar is made of simple shapes, and you can switch to a real 3D character:

1. On [mixamo.com](https://www.mixamo.com), pick a character and download these animations as **FBX**:
   - *Idle*, **With Skin**
   - *Walking*, **Without Skin**, with **In Place** ticked
   - *Running* (optional), **Without Skin**, with **In Place** ticked
2. In [Blender](https://www.blender.org) (free), File → Import → FBX the *Idle* file first. Then import the other two the same way.
3. Click the character's skeleton (armature) and open the **Action Editor**. Every imported clip appears in its action list. Rename the three to `idle`, `walk` and `run`, and click the 🛡 (*Fake User*) button on each so Blender keeps them.
4. Delete the extra skeletons that the walk/run imports created.
5. File → Export → **glTF 2.0 (.glb)**. Under *Animation*, choose mode **Actions** so all three clips are included.
6. Save it as `public/models/avatar.glb` (create the `models` folder).
7. In `src/config.js` set `avatar.type: 'glb'`.

The model is scaled automatically to `avatar.glb.height`. If it walks backwards, set `rotationY: Math.PI`. Animation names are matched loosely ("walk" also finds "Walking" or "mixamo.com|Walk"). If loading fails, the game falls back to the built-in avatar and logs the reason in the browser console.

## 4. Put it online

First run `npm run build`. This creates a `dist/` folder containing the finished website. To check it locally, run `npm run preview` and open the address it prints. (Opening `dist/index.html` by double-clicking doesn't work; browsers block that for 3D sites.)

### Option A: Netlify Drop (easiest, about 2 minutes, no Git)

1. Run `npm run build`.
2. Go to **https://app.netlify.com/drop** and log in (it's free).
3. Drag the **`dist` folder** onto the page.
4. You get a link like `https://dreamy-name-123.netlify.app`. Under **Site configuration → Change site name** you can make it e.g. `our-museum-anna.netlify.app`.

To update later, run `npm run build` again, then open your site in Netlify → **Deploys** and drag the new `dist` folder onto it.

Only the finished site is uploaded, so your original photos never leave your Mac.

### Option B: GitHub Pages (updates automatically on every push)

1. Create a **new repository** on github.com, e.g. `our-museum`. GitHub Pages is free for public repositories. Your original photos are **not** uploaded (see `.gitignore`): only `photos.json` and the small, cleaned-up copies in `public/gallery/` are.
2. In this folder, run:

   ```bash
   npm run build                      # makes sure public/gallery is up to date
   git init
   git add .
   git commit -m "Our museum"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/our-museum.git
   git push -u origin main
   ```

3. On GitHub, open the repository → **Settings → Pages**, and under *Build and deployment → Source* choose **GitHub Actions**.
4. Open the **Actions** tab and wait for "Deploy to GitHub Pages" to turn green (about 1 minute). Your site is at `https://YOUR-USERNAME.github.io/our-museum/`.

To update later, run `npm run build` (or keep `npm run dev` running while you edit), then `git add . && git commit -m "update" && git push`.

Netlify can also deploy from that GitHub repository: in Netlify choose "Import an existing project". The `netlify.toml` file already has the right settings.

### Privacy note

Anyone who has the link can open the site. The site asks search engines not to list it, but treat the link like a private photo album: share it only with your person.

## 5. Project map

```
photos/                 ← YOUR photos + photos.json
public/audio/song.mp3   ← YOUR song
src/config.js           ← YOUR texts, rooms, colours, message, settings
src/style.css           ← look of the start screen, captions, viewer, letter

src/main.js             starts everything and connects the game to the screens
src/game.js             renderer, main loop, "which photo am I near?", taps
src/world/layout.js     floor plan: room sizes, doors, where photos hang
src/world/museum.js     walls, floor, ceiling, signs, benches, plants, lights
src/world/frames.js     picture frames, labels and (faked, fast) spotlights
src/world/finale.js     hidden room: curtain, heart, floating hearts, letter
src/world/dust.js       golden dust in the air
src/world/textures.js   wood floor, plaster, glows and text, drawn in code
src/world/collision.js  walls stop the avatar and the camera
src/player/avatar.js    the built-in avatar (+ loader for .glb avatars)
src/player/controller.js walking, turning, collisions
src/player/cameraRig.js third-person camera
src/input/input.js      keyboard, mouse, touch joystick, swipes
src/ui/*.js             start screen, HUD, caption card, photo viewer, letter
src/audio/music.js      background music + mute (with the iPhone rules)
scripts/photos.mjs      photo resizing pipeline
```

## 6. Troubleshooting

- **"Couldn't load the photos"**: start the site with `npm run dev` or `npm run preview` instead of opening the HTML file directly.
- **A photo is missing**: check the terminal. It prints a ⚠ line for each `file` it can't find.
- **No sound on iPhone**: sound starts when you tap Enter. Check the volume buttons and the 🔊 button (top right). Sound pauses when you switch apps and resumes when you come back.
- **Slow on an older phone**: the game automatically lowers its resolution if it struggles. You can also lower `graphics.maxPixelRatio` to `1.5` in `src/config.js`.
- **Everything is slow to sync**: this folder is in OneDrive, and `node_modules/` (about 85 MB of tools) syncs too. It's safe to delete `node_modules/` at any time, and `npm install` brings it back.
