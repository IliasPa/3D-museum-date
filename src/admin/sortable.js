/**
 * Drag & drop sorting for cards — mouse, pen and touch alike. The card you
 * pick up follows your pointer, the others glide out of its way (a "FLIP"
 * animation: measure, move, then animate from the old spot to the new one),
 * and on release it settles into its new place.
 *
 *   sortable(root, {
 *     item: '.photo-card',        cards that can be dragged…
 *     handle: '.photo-thumb',     …by this part of them
 *     list: '.photo-grid',        containers a card can be dropped into
 *     zone: '.photo-room',        (optional) a bigger area that counts as its list
 *     targets: ['.bin'],          other drop targets, e.g. a bin
 *     onDrop({ item, list, index, from, target })   → false to put the card back
 *   })
 */
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

export function sortable(root, { item, handle, list, zone = null, targets = [], onDrop }) {
  let drag = null;

  root.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest(handle);
    const card = grip?.closest(item);
    if (!card || !root.contains(card) || e.button !== 0 || drag) return;
    e.preventDefault();
    drag = { card, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, started: false };
  });

  // Followed on the whole window: the card (and its pointer capture) moves
  // around the page, and the bin may be outside `root`.
  addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.started) {
      if (Math.hypot(drag.x - drag.x0, drag.y - drag.y0) < 6) return;
      start();
    }
    follow();
  });

  const finish = (cancelled) => (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    cancelAnimationFrame(d.scroll);
    if (d.started) drop(d, cancelled);
  };
  addEventListener('pointerup', finish(false));
  addEventListener('pointercancel', finish(true));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drag?.started) finish(true)({ pointerId: drag.id });
  });

  function start() {
    const { card } = drag;
    const rect = card.getBoundingClientRect();
    drag.started = true;
    drag.from = { list: card.parentElement, next: card.nextElementSibling };
    drag.offset = { x: drag.x0 - rect.left, y: drag.y0 - rect.top };
    const ghost = card.cloneNode(true);
    ghost.classList.add('drag-ghost');
    Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, left: '0px', top: '0px' });
    document.body.append(ghost);
    drag.ghost = ghost;
    card.classList.add('drag-placeholder');
    document.body.classList.add('dragging-card');
    drag.scroll = requestAnimationFrame(autoScroll);
  }

  /** Move the ghost, and the placeholder to where the card would land. */
  function follow() {
    const { ghost, card, offset } = drag;
    ghost.style.transform = `translate(${drag.x - offset.x}px, ${drag.y - offset.y}px) rotate(1.5deg) scale(1.03)`;
    const under = document.elementFromPoint(drag.x, drag.y);
    // Over a drop target (the bin)?
    const target = targets.map((t) => under?.closest(t)).find(Boolean) ?? null;
    if (target !== drag.target) {
      drag.target?.classList.remove('drop-over');
      target?.classList.add('drop-over');
      drag.target = target;
    }
    if (target) return;
    // Over a list (or its zone): where in it?
    const area = (zone && under?.closest(zone)) || under?.closest(list);
    const into = area?.matches(list) ? area : area?.querySelector(list);
    if (!into || !root.contains(into)) return;
    const over = under.closest(item);
    let before = null;
    if (over && over !== card && into.contains(over)) {
      const r = over.getBoundingClientRect();
      const after = r.width > r.height * 1.5 ? drag.x > r.left + r.width / 2 : drag.y > r.top + r.height / 2;
      before = after ? over.nextElementSibling : over;
    } else if (over === card) {
      return;
    } else {
      // Empty space: before the first card further down/right, else at the end.
      before = [...into.querySelectorAll(`:scope > ${item}`)].find((c) => {
        if (c === card) return false;
        const r = c.getBoundingClientRect();
        return drag.y < r.top || (drag.y < r.bottom && drag.x < r.left + r.width / 2);
      }) ?? null;
    }
    if (card.parentElement === into && (card.nextElementSibling === before || before === card)) return;
    flip([...root.querySelectorAll(item)], () => into.insertBefore(card, before));
  }

  async function drop(d, cancelled) {
    const { card, ghost } = d;
    d.target?.classList.remove('drop-over');
    document.body.classList.remove('dragging-card');
    let accepted = !cancelled;
    if (accepted) {
      const result = d.target
        ? onDrop({ item: card, target: d.target })
        : onDrop({ item: card, list: card.parentElement, index: [...card.parentElement.querySelectorAll(`:scope > ${item}`)].indexOf(card), from: d.from.list });
      accepted = (await result) !== false;
    }
    if (d.target && accepted) {
      // Into the bin: shrink away.
      const t = d.target.getBoundingClientRect();
      const g = ghost.getBoundingClientRect();
      await ghost.animate([
        { transform: ghost.style.transform, opacity: 1 },
        { transform: `translate(${t.left + t.width / 2 - g.width / 2}px, ${t.top + t.height / 2 - g.height / 2}px) scale(0.15)`, opacity: 0 },
      ], { duration: 260, easing: 'ease-in' }).finished;
      ghost.remove();
      return;
    }
    if (!accepted && card.isConnected) {
      // Put it back where it came from.
      flip([...root.querySelectorAll(item)], () => d.from.list.insertBefore(card, d.from.next?.parentElement === d.from.list ? d.from.next : null));
    }
    if (card.isConnected) {
      const to = card.getBoundingClientRect();
      await ghost.animate([
        { transform: ghost.style.transform },
        { transform: `translate(${to.left}px, ${to.top}px)` },
      ], { duration: 220, easing: EASE }).finished.catch(() => {});
    }
    ghost.remove();
    card.classList.remove('drag-placeholder');
  }

  /** Scroll the page when dragging near its top or bottom edge. */
  function autoScroll() {
    if (!drag) return;
    const edge = 70;
    const v = drag.y < edge ? -(edge - drag.y) : drag.y > innerHeight - edge ? drag.y - (innerHeight - edge) : 0;
    if (v) {
      scrollBy(0, v * 0.35);
      follow();
    }
    drag.scroll = requestAnimationFrame(autoScroll);
  }
}

/** Run `change` (which moves elements) and animate `els` from where they were. */
export function flip(els, change) {
  const before = new Map(els.map((el) => [el, el.getBoundingClientRect()]));
  change();
  for (const [el, r] of before) {
    if (!el.isConnected || el.classList.contains('drag-placeholder')) continue;
    const now = el.getBoundingClientRect();
    const dx = r.left - now.left;
    const dy = r.top - now.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 240, easing: EASE });
  }
}
