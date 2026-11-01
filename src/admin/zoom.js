/**
 * A photo (or video) shown big on the curator page: click a picture to open
 * it, × / Esc / a click beside it to close. `decorate(frame, img)` can add
 * things on top of the picture — the key hunt puts its keys there.
 */
const overlay = document.createElement('div');
overlay.className = 'zoom';
overlay.hidden = true;
overlay.innerHTML = `
  <div class="zoom-stage"></div>
  <p class="zoom-caption"></p>
  <button class="zoom-close" type="button" aria-label="Close">×</button>`;
document.body.append(overlay);
const stage = overlay.querySelector('.zoom-stage');
const caption = overlay.querySelector('.zoom-caption');
let onClosed = null;

overlay.querySelector('.zoom-close').addEventListener('click', () => closeZoom());
overlay.addEventListener('click', (e) => {
  if (e.target === overlay || e.target === stage) closeZoom();
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !overlay.hidden) closeZoom();
});

/**
 * @param src       the picture (a URL or a promise of one); `lowSrc` shows first while it loads
 * @param video     a promise of a video URL — shows a player instead of the picture
 * @param text      a line under it
 * @param decorate  (frame, img) => void — add overlays (positioned in % of the picture)
 * @param onClose   () => void
 */
export function openZoom({ src, lowSrc = null, video = null, text = '', decorate = null, onClose = null }) {
  closeZoom();
  onClosed = onClose;
  caption.textContent = text;
  const frame = document.createElement('div');
  frame.className = 'zoom-frame';
  if (video) {
    const player = document.createElement('video');
    player.controls = true;
    player.playsInline = true;
    if (lowSrc) player.poster = lowSrc;
    frame.append(player);
    Promise.resolve(video).then((url) => {
      if (frame.isConnected) {
        player.src = url;
        player.play().catch(() => {});
      }
    }).catch(() => (caption.textContent = 'The video couldn’t be loaded.'));
  } else {
    const img = new Image();
    img.alt = '';
    img.draggable = false;
    if (lowSrc) img.src = lowSrc;
    Promise.resolve(src).then((url) => url && frame.isConnected && (img.src = url)).catch(() => {});
    frame.append(img);
    decorate?.(frame, img);
  }
  stage.replaceChildren(frame);
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('show'));
  return frame;
}

export function closeZoom() {
  if (overlay.hidden) return;
  overlay.classList.remove('show');
  overlay.hidden = true;
  stage.querySelector('video')?.pause();
  stage.replaceChildren();
  const done = onClosed;
  onClosed = null;
  done?.();
}

export const zoomOpen = () => !overlay.hidden;
