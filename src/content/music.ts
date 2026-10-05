/** Background tracks for the building tour, self-hosted in public/audio. All are CC0 (public domain). */
export type Mood = 'day' | 'night' | 'phonk';
export type Track = { title: string; src: string; source: string };

export const MUSIC_ARTIST = { name: 'HoliznaCC0', url: 'https://freemusicarchive.org/music/holiznacc0/' };
export const MUSIC_LICENSE = { license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' };

const fma = (album: string, handle: string) => `https://freemusicarchive.org/music/holiznacc0/${album}/${handle}/`;
const LOFI = 'public-domain-lofi';
const PHONK = 'phonk-aura-farming';

export const PLAYLISTS: Record<Mood, Track[]> = {
  day: [
    { title: 'Roof Tops', src: '/audio/day-roof-tops.mp3', source: fma('summer-air-lo-fi', 'roof-tops') },
    { title: 'Bubbles', src: '/audio/day-bubbles.mp3', source: fma(LOFI, 'bubbles-lofi-bright-relaxed') },
    { title: 'Tranquil Mindscape', src: '/audio/day-tranquil-mindscape.mp3', source: fma(LOFI, 'tranquil-mindscape-lofi-happy-reflection') },
    { title: 'Walking Away', src: '/audio/day-walking-away.mp3', source: fma(LOFI, 'walking-away-lofi-peaceful-motivating') },
    { title: 'Projector Screen', src: '/audio/day-projector-screen.mp3', source: fma(LOFI, 'projector-screen-lofi-happy-mp3') },
    { title: 'Doodles', src: '/audio/day-doodles.mp3', source: fma(LOFI, 'doodles-lofi-happy-mp3') },
    { title: 'Ocean Breeze', src: '/audio/day-ocean-breeze.mp3', source: fma(LOFI, 'ocean-breeze-lofi-ukulele-peaceful-mp3') },
    { title: 'Summer Break', src: '/audio/day-summer-break.mp3', source: fma(LOFI, 'summer-break-lofi-nostalgic-mp3') },
  ],
  night: [
    { title: 'Tokyo Sunset', src: '/audio/night-tokyo-sunset.mp3', source: fma(LOFI, 'tokyo-sunset-lofi-peaceful-soft') },
    { title: 'Ease into Night', src: '/audio/night-ease-into-night.mp3', source: fma(LOFI, 'ease-into-night-lofi-relax-chill') },
    { title: 'Moon Unit', src: '/audio/night-moon-unit.mp3', source: fma(LOFI, 'moon-unit-lofi-reflection-dreamy') },
    { title: 'One Night In France', src: '/audio/night-one-night-in-france.mp3', source: fma(LOFI, 'one-night-in-france-lofi-nostalgic-chill') },
    { title: 'Lucid', src: '/audio/night-lucid.mp3', source: fma(LOFI, 'lucid-lofi-dreamy-chill') },
    { title: 'Dreamy Reverie', src: '/audio/night-dreamy-reverie.mp3', source: fma(LOFI, 'dreamy-reverie-lofi-nostalgic-chill') },
    { title: 'Into The Mist', src: '/audio/night-into-the-mist.mp3', source: fma(LOFI, 'into-the-mist-lofi-calm-relaxed') },
    { title: 'Infinite Echoes', src: '/audio/night-infinite-echoes.mp3', source: fma(LOFI, 'infinite-echoes-lofi-dreamy-soft') },
  ],
  phonk: [
    { title: 'ONLY HUMAN', src: '/audio/phonk-only-human.mp3', source: fma(PHONK, 'only-human') },
    { title: 'Re Adusjtment', src: '/audio/phonk-re-adusjtment.mp3', source: fma(PHONK, 're-adusjtment') },
    { title: 'Pantheon', src: '/audio/phonk-pantheon.mp3', source: fma(PHONK, 'pantheon') },
    { title: 'Phonk Remix', src: '/audio/phonk-phonk-remix.mp3', source: fma(PHONK, 'phonk-remix') },
    { title: 'Phonk ish', src: '/audio/phonk-phonk-ish.mp3', source: fma(PHONK, 'phonk-ish') },
  ],
};

export const MOOD_LABEL: Record<Mood, string> = { day: 'ביום', night: 'בלילה', phonk: 'פונק' };

/** Fisher–Yates order of 0..n-1 that never starts with `avoid`, so a reshuffle does not repeat the last song. */
export function shuffledOrder(n: number, random: () => number, avoid = -1): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  if (n > 1 && order[0] === avoid) [order[0], order[n - 1]] = [order[n - 1]!, order[0]!];
  return order;
}
