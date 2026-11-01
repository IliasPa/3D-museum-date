/**
 * Seasonal decorations: which one a museum shows. "seasonal" follows the
 * calendar by itself (northern hemisphere): Halloween in late October,
 * Christmas in December, Valentine's in early February, and the four seasons
 * in between.
 */
export const DECORATIONS = {
  none: { label: 'None', emoji: '' },
  halloween: { label: 'Halloween', emoji: '🎃' },
  christmas: { label: 'Christmas', emoji: '🎄' },
  winter: { label: 'Winter', emoji: '❄️' },
  valentine: { label: 'Valentine’s', emoji: '💝' },
  spring: { label: 'Spring', emoji: '🌸' },
  summer: { label: 'Summer', emoji: '🌻' },
  autumn: { label: 'Autumn', emoji: '🍂' },
};

/** The decoration for a date (month 1–12, day 1–31). */
export function seasonFor(date = new Date()) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const md = m * 100 + d; // e.g. 1031 = 31 October
  if (md >= 1015 && md <= 1102) return 'halloween';
  if (md >= 1201 || md <= 106) return 'christmas';
  if (md >= 201 && md <= 215) return 'valentine';
  if (md >= 301 && md <= 531) return 'spring';
  if (md >= 601 && md <= 831) return 'summer';
  if (md >= 901 && md <= 1130) return 'autumn';
  return 'winter';
}

/** The museum's choice → the decoration to show now ('none' | 'halloween' | …). */
export function resolveDecoration(choice, date = new Date()) {
  if (choice === 'seasonal') return seasonFor(date);
  return DECORATIONS[choice] ? choice : 'none';
}
