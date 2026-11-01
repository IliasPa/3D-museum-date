# Changes

What changed in each version of Our Museum. The newest is at the top. Every
version has a tag and a release on GitHub.

## 2.1.1 — 1 November 2026
- **Why the keys weren't shared:** the database rules on Google's servers were still the ones from 25 October, from before the key hunt, so every find was refused. Putting this version's rules there fixes it: `npm run deploy:rules`. The same rules save "Last visited", the second clock and the proposal's answer.
- **The curator page warns** when the rules on Google's servers are older than the site, and says what to run.
- **The museum no longer says "together"** when the finds can't be shared. Each of you then counts your own, and the start hint says "find them" instead of "find them together".
- **README:** GitHub's "Google API Key" alert needs no change in the code. Checked again: the key is refused from any other website.

## 2.1.0 — 1 November 2026

### In the museum
- **Walls no longer show through into the next room.** Where two rooms had different widths, a strip of one room's wall colour flickered on the next room's wall.
- **Videos on the walls:** a video can hang on a photo spot, in a frame like a photo, with a ▶ on it.
  - It plays there silently while you stand in front of it.
  - A tap (or Space) shows it full screen with sound, and the music waits.
- **Bench actions no longer sink into each other.**
  - The heads are big, so leaning in (a kiss, a cuddle, an Eskimo kiss, a whisper, a big hug…) now goes only until the heads touch, shared between the two of you.
  - Sitting close leaves a little more room between you.
  - Hugs and kisses standing up too: a hug is cheek to cheek.
  - The arm around the shoulder (A, Y) and round the waist (C) reach behind the other one's back, the heart (M) meets in the middle, and the ice cream (F) goes up to their mouth.
- **The key hunt is a game for two:**
  - A key either of you finds counts for both.
  - You're told when the other one finds one: "Anna found one! 🔑 3 of 5 — together".
  - At the start: "5 keys are hidden in the photos — find them together".
- **A new look for the memory map:**
  - An old paper map: a soft shoreline, dashed borders, country names, a compass, and the title on a ribbon.
  - The countries you've been to are tinted, and a dashed line goes from place to place in the order of the photos.
  - Above every pin floats a little polaroid of its photo, with the place written under it. Tap it to see the photos.
  - The room's pink light no longer washes it out.
  - The simple gallery and the curator page use the same map.
- **The mirror** picks one of your pictures at random each time you step up to it, and again every few seconds. The same one may come again.
- **The photo viewer:** right after closing it, the card of the next photo you walk up to could stay hidden; and a photo opened again within a moment of closing the viewer could vanish. Both fixed.

### Curator page
- **"+ Add photos/videos"** (was "+ Add photos"): videos fill the free spots too.
  - A free spot's button is now **"+ Add a photo or video"**.
  - Files dropped on a spot or a room work the same way. A video dropped on a bench still hangs at that bench.
- **Drag a ▶ between spots and benches.** From a spot onto a bench, it plays when someone sits there. From a bench onto a spot, it plays on the wall.
- **Key hunt:**
  - The big key sits inside the settings box, at its top right.
  - Hold a dragged key at the top or bottom edge of the window and the page scrolls, to reach photos further down.
  - The status shows how many the guests found together, and who found which. Found keys get a ✓.
- **Memory map:**
  - After adding photos, the Preview says how many brought their place along. If some didn't, it says why that happens (location off on the camera, removed by a chat app, or by the phone when sharing) and to place them in the Memory map tab.
  - Each photo's panel in the Preview shows its place (📍).
  - The sample photos come with places.
  - The rows of the list line up.
- **Moves are always saved.** Moving a photo or the mirror to another spot was sometimes lost after a reload (when the walking order stayed the same).
- **No longer the same:** a video file dropped on a room (not on a bench) now takes a free spot there, instead of the room's first free bench.

### Behind the scenes
- No new database rules in this version. The key hunt is only shared once the 2.0.0 rules are on Google's servers (`npm run deploy:rules`); without them, each of you hunts alone.

## 2.0.0 — 1 November 2026

### Curator page
- **The Photos and Videos tabs are gone: everything happens on the Preview.**
  - Click a free (red) spot and press **+ Add a photo**, or drop a photo onto a spot or a room on the plan.
  - **+ Add photos** fills the free spots in walking order (or the selected room).
  - **Add 10 sample photos** moved to the Preview too.
  - Click a bench and press **+ Add a video** to hang one in front of *that* bench.
  - Click a ▶ to edit the video's title and caption, delete it, or play it big.
  - Drag a ▶ onto another bench to move it (two videos swap).
- **Click a photo to see it bigger** (videos play big).
- **No longer possible**, compared with the old tabs:
  - Seeing and editing every photo's title, date and caption in one long list. Now it's one photo at a time: click its spot on the plan.
  - Reordering photos by dragging cards in a list. Now drag the numbered spots on the plan (onto another spot they swap).
  - Deleting by dropping a photo on the bin. Now use "Delete photo" in the spot's panel (still with Undo).
  - Choosing a video's room from a drop-down. Now drag its ▶ onto a bench or a room.
- **Guests:**
  - "Last visited" next to each email.
  - An optional name for each guest, shown on the clocks, in the proposal and above their avatar.
  - Per-guest toggles for a **guided tour** and **reduced motion**.
- New **Proposal** tab: switch it on, choose which guest kneels with the ring, and write the question, both buttons, the line after the yes, and the ring's metal and stone. It shows when they said yes, and how many times they tried to press No.
- New **Memory map** tab:
  - Photos bring the place they were taken along (from the phone's data, rounded to about 100 m).
  - Place pins by hand on a map, or paste coordinates.
  - Name places, remove pins, change the table's title, or switch the table off.
- New **Key hunt** tab (before Preview):
  - Switch it on and choose how many and the shape (keys, hearts, stars, rings, flowers or shells).
  - Drag keys from the big key onto the photos, between photos, or back onto it to take them out. This works in the bigger view too.
  - "Hide the rest for me" places the rest at random.
  - Optionally make them easy to spot, and lock the curtain until all are found.
  - "Hide them all again" starts the hunt over.
  - The Preview shows the keys in the photos, and a small 🔑 next to their spots on the plan.
- **The mirror** takes a photo spot and moves like a photo. You add pictures for each guest (or for everyone). Making them with AI here is coming in a future update.
- **Decoration** setting on the start dot:
  - None, Halloween, Christmas, winter, Valentine's, spring, summer or autumn.
  - Or **Seasonal**, which changes by itself with the date.

### In the museum
- **The proposal:**
  - The chosen guest gets a 💍 button.
  - Next to the other person, they kneel with an open ring box.
  - The other person sees the question, a YES that keeps growing, and a No that swims away from every finger (the date app's No, with its taunts).
  - Then fireworks, and a celebration on both screens.
- **D next to each other:** whoever presses first twirls the other. Press it together and you dance together, holding hands.
- **26 new actions on a bench.** While seated, A–Z do other things:
  - Arm around the shoulder, a blown kiss that floats over, cuddling closer.
  - A seat dance, an Eskimo kiss, feeding each other ice cream, giggles.
  - A head on the shoulder, "I love you", jumping up, a kiss on the cheek, looking into each other's eyes.
  - A heart made together, a nap, offering a flower, a real **selfie**.
  - A **quiet moment** (everything slows down and the music softens), resting with legs swinging, a tickle attack.
  - Uno reverse, a peace sign, a whispered secret, a big hug (or a hug for nobody, and tears).
  - The yawn-and-stretch, and a head in the lap.
  - The other one reacts on their own, and the menu shows the bench actions while you sit.
- **Clocks** on the back wall of the first room: two if you live in different time zones, otherwise one. Only the time zone is used, never a location.
- **Seasonal decorations:**
  - String lights, and snow, leaves or petals drifting down.
  - Pumpkins, bats, cobwebs and ghosts; a Christmas tree with presents and garlands; a snowman.
  - Heart balloons, flowers, sunflowers and butterflies, piles of leaves.
- **The memory map table** in the middle of the hidden room. Tap a pin to see its photos. The heart moves back towards the letter to make room.
- **The key hunt:**
  - Small keys hidden in the photos. Tap them on the wall or in the photo viewer.
  - Finds are shared (🔑 2 / 5 under the room name).
  - The curtain can stay locked until all are found.
- **The mirror:** black from afar. In front of it, a swirling mist clears to show your own pictures, or the two of you reflected.
- **Guided tour** (per guest): your avatar walks through the museum, stopping at every photo. Walking yourself pauses it.
- **Reduced motion** (per guest, or the phone's setting): calmer camera, fewer floating and pulsing things.
- **A simple gallery for phones too old or slow for 3D** (or without WebGL): the same rooms, photos, videos, mirror, map, key hunt and letter as a scrolling page. A button offers it if a phone struggles mid-visit.
- Smoother changes between actions, and bench actions end back in a seated pose.

### Behind the scenes
- New database rules:
  - Each guest may write only their own visit record: last visit, time zone, and the proposal's answer.
  - Key-hunt finds live in the Realtime Database.
  - Run `npm run deploy:rules` after updating.
- New libraries: `exifr` (reads where a photo was taken), `world-atlas` and `topojson-client` (country outlines for the map, bundled with the site and loaded only when a map is shown).

## 1.5.0 — 31 October 2026
- **Avatar studio** with picture tiles: every option is shown as a little picture of your own avatar wearing it, and the preview zooms in on what you're changing.
- **Many more looks**, about 36 settings with any colour:
  - Eye shapes, mouths, blush, ears and facial hair.
  - 22 hairstyles with highlights, 13 tops with prints, and shoes.
  - 21 hats, glasses and neck extras.
  - Wings and capes, tails, and things to carry.
- **Pets** (cat, puppy, bunny, duckling, bear cub) that trot after you.
- **Wardrobe** (👕) to change your look during a visit; the other person sees it right away.
- **Space** shows the film full screen while you sit at a video.

## 1.4.0 — 26 October 2026
- **Safari video uploads work:** videos are encoded as Baseline H.264.
  - No time limit any more. Each video is at most 50 MB, with quality fitted to its length.
  - Videos download when their room is reached.
- Storage meter on the curator page (1 GB free plan, all museums together).
- **Fixed photo spots** on all four walls of every room. Photos keep their spot unless the room is resized.
- Preview: green and red spots. Click one to edit or upload. The start dot and the last room hold the texts (the Texts tab is gone).
- Photos tab: drag and drop to reorder or move photos between rooms, and a bin to delete (with Undo).
- No more light beams through walls.
- A two-handed rainbow, and heart hands with curled fingers.
- Many more avatar options.

## 1.3.0 — 26 October 2026
- **Detailed avatar:**
  - Jointed arms and legs.
  - Hands with five fingers that make gestures (peace, wave, fist, paws, heart…).
  - Ears, nose, eyebrows and a neck; feet that stand on the floor.
- Flips, crouches and lying down stay on the floor.
- **Room layout editor** in the Preview:
  - Rename, recolour, resize (8–30 m), reorder, add or remove rooms.
  - Drag photos and videos to another room.

## 1.2.0 — 25 October 2026
- **Each couple has its own link** (`?m=name`). People only ever see the museums they're invited to.
- **Avatar studio:** body, skin, eyes, hair, clothes, hats, glasses and extras, and a random look.
- **26 actions (A–Z)**, seen by everyone. Hug, kiss and tickle reach the other person, who reacts.
- **Holding hands** when side by side.
- **Videos** hang in front of benches and play with sound when you sit there.
- Arrow keys walk; Space opens a photo.

## 1.1.1 — 25 October 2026
- The public Firebase web key is explained and restricted to the site's own addresses and APIs, with a clear message for sign-ins from other addresses.
- README: how to close GitHub's secret-scanning alert.

## 1.1.0 — 25 October 2026
- **Sign in with Google.** Only emails on a museum's guest list get in.
- **The curator page** (`/admin`): one museum per couple, each with its own:
  - Photos (resized in the browser; iPhone HEIC works).
  - Texts, rooms, message and song.
  - Guest list.
- **Walking around together:** everyone in the same museum sees each other live, with name tags, looks and hearts.
- Firebase free plan: Firestore and the Realtime Database, with security rules for both.

## 1.0.0 — 25 October 2026
- A tiny 3D museum: three themed rooms of framed photos and a hidden last room with a personal message behind a red curtain, with music and floating hearts.
