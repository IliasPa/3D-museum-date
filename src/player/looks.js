/**
 * Avatar looks: each visitor picks a sweater, hair colour, skin tone and hairstyle
 * on the start screen. The look is remembered on the device and sent to the
 * other visitor so they see you the way you chose.
 */
export const LOOK_OPTIONS = {
  shirt: ['#e8737f', '#6f9fd8', '#f2b84b', '#7cc49a', '#b48be0', '#f4f1ec'],
  hair: ['#4a3026', '#1f1a1a', '#b5763f', '#e3c27a'],
  skin: ['#f5cfb6', '#e8b58f', '#c98e66', '#8d5a3b'],
  style: ['short', 'long', 'bun'],
};

const STORAGE_KEY = 'museum-look';

export function defaultLook() {
  return { shirt: LOOK_OPTIONS.shirt[0], hair: LOOK_OPTIONS.hair[0], skin: LOOK_OPTIONS.skin[0], style: 'short' };
}

/** Remembered look for this device (or the default). */
export function loadLook() {
  try {
    return decodeLook(localStorage.getItem(STORAGE_KEY)) ?? defaultLook();
  } catch {
    return defaultLook();
  }
}

export function saveLook(look) {
  try {
    localStorage.setItem(STORAGE_KEY, encodeLook(look));
  } catch {}
}

/** Compact text form for the network: "#e8737f|#4a3026|#f5cfb6|short". */
export function encodeLook(look) {
  return [look.shirt, look.hair, look.skin, look.style].join('|');
}

export function decodeLook(text) {
  const [shirt, hair, skin, style] = String(text ?? '').split('|');
  const isColor = (c) => /^#[0-9a-f]{6}$/i.test(c ?? '');
  if (!isColor(shirt) || !isColor(hair) || !isColor(skin)) return null;
  return { shirt, hair, skin, style: LOOK_OPTIONS.style.includes(style) ? style : 'short' };
}

/** Avatar colours = the config's base colours with the look applied. */
export function lookColors(look, baseColors) {
  return { ...baseColors, shirt: look.shirt, hair: look.hair, skin: look.skin };
}
