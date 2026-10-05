'use client';

import { clsx } from 'clsx';
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, Box, Clock, DoorOpen, Footprints, Hand, Home, LogOut, Maximize2, Minimize2, Moon, Music, SkipForward, Sun, VolumeX } from 'lucide-react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FLOOR_COUNT, PROGRAM_COPY, programOf } from '@/components/three/building-model';
import { use3DCapable } from '@/components/three/capability';
import { useFullscreen, useInView } from '@/components/three/stage-hooks';
import type { Mood, Track } from '@/content/music';
import { RESIDENCE_NAME, RESIDENTS } from '@/content/residents';
import { AmbientMusic } from './ambient-music';
import { WALK_SIGNAL } from './walk-signal';
import { daylightOf, sunPosition, type SkyMode } from './sky';

const BuildingScene = dynamic(() => import('./BuildingScene'), { ssr: false });

const SKY_MODES: { mode: SkyMode; label: string; Icon: typeof Sun }[] = [
  { mode: 'auto', label: 'תאורה לפי השעה עכשיו בישראל', Icon: Clock },
  { mode: 'day', label: 'יום', Icon: Sun },
  { mode: 'night', label: 'לילה', Icon: Moon },
];

type Station = 'chill' | 'phonk';

function moodFor(mode: SkyMode, station: Station): Mood {
  if (station === 'phonk') return 'phonk';
  if (mode !== 'auto') return mode;
  return daylightOf(sunPosition(new Date()).alt) > 0.5 ? 'day' : 'night';
}

export const BUILDING_POSTER = '/images/renders/building-poster.webp';

const FLOORS_TOP_DOWN = Array.from({ length: FLOOR_COUNT }, (_, k) => FLOOR_COUNT - 1 - k);

/**
 * A trip in the cabin you are standing in. Office levels: −1 the lobby, then floor indexes;
 * residence levels: 0 the lobby, then apartments 1–8.
 */
type Ride = { building: 'office' | 'home'; from: number; to: number };
const LOBBY_LEVEL = -1;
const levelOf = (i: number | null) => i ?? LOBBY_LEVEL;
const levelLabel = (r: Ride, level: number) => (r.building === 'home' ? (level === 0 ? 'L' : String(level)) : level === LOBBY_LEVEL ? 'L' : String(level + 1));
const destination = (r: Ride) => (r.building === 'home' ? (r.to === 0 ? 'לובי' : `דירה ${r.to}`) : r.to === LOBBY_LEVEL ? 'לובי' : `קומה ${r.to + 1}`);
/** Doors take about a second to close before the cabin moves. */
const DOORS_MS = 1200;
const chip = 'rounded-full bg-black/60 text-white backdrop-blur';

export function BuildingShowcase({ className }: { className?: string }) {
  const capable = use3DCapable();
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const near = useInView(stage, '300px');
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [walking, setWalking] = useState(false);
  const [elevatorTrips, setElevatorTrips] = useState(0);
  const [atElevator, setAtElevator] = useState(false);
  const [ride, setRide] = useState<Ride | null>(null);
  const [home, setHome] = useState<number | null>(null);
  const [rideLevel, setRideLevel] = useState(LOBBY_LEVEL);
  const [skyMode, setSkyMode] = useState<SkyMode>('auto');
  const [music, setMusic] = useState(false);
  const [track, setTrack] = useState<Track | null>(null);
  const [station, setStation] = useState<Station>('chill');
  const player = useRef<AmbientMusic | null>(null);
  const onReady = useCallback(() => setReady(true), []);
  const onElevator = useCallback((at: boolean) => setAtElevator(at), []);
  const { isFull, toggle, supported } = useFullscreen(stage);
  if (capable && near && !mounted) setMounted(true);

  const toggleMusic = useCallback(() => {
    player.current ??= new AmbientMusic((t) => {
      setTrack(t);
      if (!t && !player.current?.playing) setMusic(false);
    });
    if (music) player.current.stop();
    else void player.current.start(moodFor(skyMode, station));
    setMusic(!music);
  }, [music, skyMode, station]);

  useEffect(() => {
    if (!music) return;
    player.current?.setMood(moodFor(skyMode, station));
    const id = window.setInterval(() => player.current?.setMood(moodFor(skyMode, station)), 60_000);
    return () => window.clearInterval(id);
  }, [music, skyMode, station]);

  useEffect(() => () => player.current?.dispose(), []);

  const choose = useCallback(
    (i: number | null) => {
      if (walking) {
        if (ride) return;
        if (home !== null) {
          setHome(null);
          setSelected(i);
          setElevatorTrips((t) => t + 1);
          return;
        }
        if (i === selected) return;
        if (atElevator) {
          WALK_SIGNAL.riding = true;
          setRideLevel(levelOf(selected));
          setRide({
            building: 'office',
            from: levelOf(selected),
            to: levelOf(i),
          });
          return;
        }
        setSelected(i);
        setElevatorTrips((t) => t + 1);
        return;
      }
      setSelected(i === selected ? null : i);
    },
    [walking, selected, ride, atElevator, home],
  );

  const chooseHome = useCallback(
    (level: number) => {
      if (ride || home === null || level === home) return;
      if (atElevator) {
        WALK_SIGNAL.riding = true;
        setRideLevel(home);
        setRide({ building: 'home', from: home, to: level });
        return;
      }
      setHome(level);
      setElevatorTrips((t) => t + 1);
    },
    [ride, home, atElevator],
  );

  const enterHome = useCallback(() => {
    setSelected(null);
    setHome(0);
    if (walking) setElevatorTrips((t) => t + 1);
    else setWalking(true);
  }, [walking]);

  const leaveHome = useCallback(() => {
    setHome(null);
    setElevatorTrips((t) => t + 1);
  }, []);

  const leaveWalk = useCallback(() => {
    setWalking(false);
    setRide(null);
    setHome(null);
    WALK_SIGNAL.arrive = false;
  }, []);

  useEffect(() => {
    if (!ride) return;
    const { from, to } = ride;
    const steps = Math.abs(to - from);
    const stepMs = Math.min(650, Math.max(110, 2600 / steps));
    const arrive = DOORS_MS + steps * stepMs + 250;
    const start = performance.now();
    let shown = from;
    let arrived = false;
    let raf = 0;
    const tick = (now: number) => {
      const t = now - start;
      const level = from + Math.sign(to - from) * Math.min(steps, Math.max(0, Math.floor((t - DOORS_MS) / stepMs)));
      if (level !== shown) setRideLevel((shown = level));
      if (!arrived && t >= arrive) {
        arrived = true;
        WALK_SIGNAL.arrive = true;
        if (ride.building === 'home') setHome(to);
        else setSelected(to === LOBBY_LEVEL ? null : to);
      }
      if (t >= arrive + 450) WALK_SIGNAL.riding = false;
      if (t >= arrive + 1500) setRide(null);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      WALK_SIGNAL.riding = false;
    };
  }, [ride]);

  useEffect(() => {
    if ((selected === null && !walking) || isFull) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (walking) leaveWalk();
      else setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, walking, isFull, leaveWalk]);

  const program = selected === null ? null : programOf(selected);
  const copy = program ? PROGRAM_COPY[program] : null;

  const floorButton = (i: number, extra: string) => {
    const on = selected === i;
    return (
      <button
        key={i}
        type="button"
        onClick={() => choose(i)}
        aria-pressed={on}
        title={`קומה ${i + 1} · ${PROGRAM_COPY[programOf(i)].title}`}
        className={clsx('shrink-0 rounded-md font-semibold tabular-nums transition-colors', on ? 'bg-accent text-accent-fg' : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white', extra)}
      >
        {i + 1}
      </button>
    );
  };

  return (
    <div ref={setStage} className={clsx('relative overflow-hidden rounded-3xl border border-border bg-[#060912] [&:fullscreen]:rounded-none', className)}>
      <Image
        src={BUILDING_POSTER}
        alt="הדמיה של מגדל משרדים בלילה: קומות מוארות, כתר סגול בגג, ועיר מסביב"
        fill
        sizes="(min-width: 1024px) 80vw, 100vw"
        className={clsx('object-cover transition-opacity duration-(--dur-reveal) ease-(--ease-out)', ready && 'opacity-0')}
      />
      {mounted && (
        <div className={clsx('absolute inset-0 transition-opacity duration-(--dur-reveal) ease-(--ease-out)', ready ? 'opacity-100' : 'opacity-0')} aria-hidden="true">
          <BuildingScene
            active={near}
            selected={selected}
            walking={walking}
            onSelect={choose}
            onReady={onReady}
            onElevator={onElevator}
            skyMode={skyMode}
            rideTo={ride?.building === 'office' && ride.to !== LOBBY_LEVEL ? ride.to : null}
            home={home}
            homeRideTo={ride?.building === 'home' ? ride.to : null}
          />
        </div>
      )}

      {walking && elevatorTrips > 0 && <div key={elevatorTrips} className="pointer-events-none absolute inset-0 animate-[elevator-fade_0.7s_ease-out_forwards] bg-black" aria-hidden="true" />}
      {walking && ride && (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 top-16 flex -translate-x-1/2 flex-col items-center gap-1 rounded-2xl border border-white/10 bg-black/85 px-6 py-2.5 text-white shadow-2xl backdrop-blur"
        >
          <span dir="ltr" className="flex items-center gap-2 font-mono text-4xl font-bold tabular-nums text-amber-300 [text-shadow:0_0_12px_rgba(252,211,77,0.6)]">
            {ride.to > ride.from ? <ArrowUp className="h-7 w-7" aria-hidden="true" /> : <ArrowDown className="h-7 w-7" aria-hidden="true" />}
            {levelLabel(ride, rideLevel)}
          </span>
          <span className="text-2xs text-white/75">{rideLevel === ride.to ? 'הגעתם · הדלתות נפתחות' : `בדרך ל${destination(ride)}`}</span>
        </div>
      )}
      {walking && !ride && !atElevator && (
        <button
          type="button"
          onClick={() => {
            WALK_SIGNAL.goElevator = true;
          }}
          className={clsx(
            'absolute right-3 flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition-transform hover:scale-[1.03] active:scale-[0.97] sm:bottom-4 sm:right-4',
            selected === null ? 'bottom-16' : 'bottom-40',
          )}
        >
          <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
          למעלית
        </button>
      )}
      {walking && !ride && atElevator && (
        <section
          aria-label="לוח המעלית"
          className="absolute left-1/2 top-1/2 w-[min(20rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-black/80 p-3 text-white shadow-2xl backdrop-blur-md"
        >
          <p className="flex items-center justify-center gap-1.5 text-sm font-bold">
            <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
            אתם במעלית · בחרו קומה
          </p>
          {home === null ? (
            <div className="mt-2.5 grid grid-cols-6 gap-1">
              {selected !== null && (
                <button type="button" onClick={() => choose(null)} className="h-8 rounded-md bg-white/10 text-xs font-semibold text-white/80 hover:bg-white/20 hover:text-white">
                  לובי
                </button>
              )}
              {Array.from({ length: FLOOR_COUNT }, (_, i) => floorButton(i, 'h-8 text-xs'))}
            </div>
          ) : (
            <div className="mt-2.5 grid grid-cols-2 gap-1">
              {home !== 0 && (
                <button type="button" onClick={() => chooseHome(0)} className="col-span-2 h-8 rounded-md bg-white/10 text-xs font-semibold text-white/80 hover:bg-white/20 hover:text-white">
                  לובי הדיירים
                </button>
              )}
              {RESIDENTS.map((r) => (
                <button
                  key={r.apt}
                  type="button"
                  onClick={() => chooseHome(r.apt)}
                  aria-pressed={home === r.apt}
                  className={clsx(
                    'flex h-9 items-center gap-1.5 rounded-md px-2 text-start text-2xs font-semibold transition-colors',
                    home === r.apt ? 'bg-accent text-accent-fg' : 'bg-white/10 text-white/85 hover:bg-white/20',
                  )}
                >
                  <span className="text-sm tabular-nums">{r.apt}</span>
                  <span className="truncate">{r.family}</span>
                </button>
              ))}
              <p className="col-span-2 text-center text-3xs text-white/50">הדיירים והשמות מדומים</p>
            </div>
          )}
          <p className="mt-2 text-center text-3xs text-white/60">או הקישו על הרצפה בחוץ כדי לצאת</p>
        </section>
      )}
      <span className={clsx(chip, 'pointer-events-none absolute left-3 top-3 px-2.5 py-1 text-xs font-medium')}>הדמיה</span>
      {capable && ready && supported && (
        <button type="button" onClick={toggle} className={clsx(chip, 'absolute right-3 top-3 p-2 hover:bg-black/75')} aria-label={isFull ? 'יציאה ממסך מלא' : 'מסך מלא'}>
          {isFull ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
        </button>
      )}
      {capable && ready && (
        <div className="absolute right-3 top-14 flex items-center gap-1.5 sm:right-14 sm:top-3">
          <div role="group" aria-label="תאורה" className={clsx(chip, 'flex items-center gap-0.5 p-0.5')}>
            {SKY_MODES.map(({ mode, label, Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSkyMode(mode)}
                aria-pressed={skyMode === mode}
                aria-label={label}
                title={label}
                className={clsx('rounded-full p-1.5 transition-colors', skyMode === mode ? 'bg-white text-zinc-950' : 'text-white/80 hover:text-white')}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggleMusic}
            aria-pressed={music}
            aria-label={music ? 'כיבוי מוזיקת רקע' : 'הפעלת מוזיקת רקע'}
            title={music ? 'כיבוי מוזיקת רקע' : 'הפעלת מוזיקת רקע'}
            className={clsx(chip, 'p-2 transition-colors', music ? 'bg-accent text-accent-fg' : 'hover:bg-black/75')}
          >
            {music ? <Music className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
          </button>
          {music && (
            <div role="group" aria-label="סגנון מוזיקה" className={clsx(chip, 'flex items-center gap-0.5 p-0.5 text-2xs')}>
              {(['chill', 'phonk'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStation(s)}
                  aria-pressed={station === s}
                  className={clsx('rounded-full px-2 py-1 transition-colors', station === s ? 'bg-white text-zinc-950' : 'text-white/80 hover:text-white')}
                >
                  {s === 'chill' ? 'רגוע' : 'פונק'}
                </button>
              ))}
            </div>
          )}
          {music && (
            <button
              type="button"
              onClick={() => player.current?.skip()}
              aria-label={track ? `לשיר הבא (עכשיו: ${track.title})` : 'לשיר הבא'}
              title={track ? `${track.title} · לשיר הבא` : 'לשיר הבא'}
              className={clsx(chip, 'flex max-w-40 items-center gap-1.5 py-1.5 pe-2.5 ps-2 text-2xs hover:bg-black/75')}
            >
              <SkipForward className="h-3.5 w-3.5 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
              {track && (
                <span dir="ltr" className="truncate">
                  {track.title}
                </span>
              )}
            </button>
          )}
        </div>
      )}
      {capable && ready && selected === null && !walking && (
        <span className={clsx(chip, 'pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-2xs text-white/90 sm:text-xs')}>
          <Hand className="h-3.5 w-3.5" aria-hidden="true" />
          גררו לסובב · בחרו קומה
        </span>
      )}

      {home === null && (
        <>
          <nav
            aria-label="בחירת קומה"
            className="absolute right-3 top-1/2 hidden max-h-[calc(100%-6rem)] -translate-y-1/2 grid-cols-2 gap-1 overflow-y-auto rounded-2xl bg-black/55 p-1.5 backdrop-blur [scrollbar-width:none] sm:grid"
          >
            <span className="col-span-2 pb-0.5 text-center text-3xs font-semibold text-white/60">קומה</span>
            {FLOORS_TOP_DOWN.map((i) => floorButton(i, 'h-5 w-7 text-3xs'))}
            <button
              type="button"
              onClick={() => choose(null)}
              aria-pressed={selected === null}
              className={clsx(
                'col-span-2 mt-0.5 flex h-6 items-center justify-center gap-1 rounded-md text-3xs font-semibold transition-colors',
                selected === null ? 'bg-accent text-accent-fg' : 'bg-white/10 text-white/80 hover:bg-white/20',
              )}
              aria-label={walking ? 'ללובי' : 'כל הבניין'}
              title={walking ? 'ללובי' : 'כל הבניין'}
            >
              {walking ? <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" /> : <Box className="h-3.5 w-3.5" aria-hidden="true" />}
              {walking ? 'לובי' : null}
            </button>
          </nav>

          <nav
            aria-label="בחירת קומה"
            className="absolute inset-x-0 bottom-0 flex gap-1.5 overflow-x-auto bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-6 [scrollbar-width:none] sm:hidden"
          >
            {walking && (
              <button
                type="button"
                onClick={() => choose(null)}
                aria-pressed={selected === null}
                className={clsx('flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold', selected === null ? 'bg-accent text-accent-fg' : 'bg-white/10 text-white/80')}
              >
                <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" />
                לובי
              </button>
            )}
            {Array.from({ length: FLOOR_COUNT }, (_, i) => floorButton(i, 'h-8 min-w-8 px-1 text-xs'))}
          </nav>
        </>
      )}

      {capable && ready && selected === null && !walking && (
        <div className="absolute bottom-16 left-3 flex flex-col items-start gap-2 sm:bottom-4 sm:left-4 sm:flex-row">
          <button
            type="button"
            onClick={() => setWalking(true)}
            className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-xs font-semibold text-accent-fg shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.97] sm:text-sm"
          >
            <Footprints className="h-4 w-4" aria-hidden="true" />
            להיכנס לבניין מהרחוב
          </button>
          <button
            type="button"
            onClick={enterHome}
            className="flex items-center gap-1.5 rounded-full border border-white/25 bg-black/60 px-4 py-2.5 text-xs font-semibold text-white shadow-lg backdrop-blur transition-transform hover:scale-[1.03] active:scale-[0.97] sm:text-sm"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            לבניין המגורים
          </button>
        </div>
      )}

      {home !== null && walking && (
        <>
          <div className={clsx(chip, 'pointer-events-none absolute left-1/2 top-3 flex max-w-[calc(100%-6rem)] -translate-x-1/2 flex-col items-center px-3.5 py-1.5 text-center')}>
            <span className="whitespace-nowrap text-xs font-semibold sm:text-sm">
              {home === 0 ? (
                <>
                  <span className="hidden sm:inline">{RESIDENCE_NAME} · </span>לובי הדיירים
                </>
              ) : (
                `דירה ${home} · ${RESIDENTS[home - 1]!.family}`
              )}
            </span>
            <span className="hidden text-2xs text-white/75 sm:block">{home === 0 ? 'לובי עם בריכה וקונסיירז׳ · 8 דירות דופלקס' : `דיירים מדומים · ${RESIDENTS[home - 1]!.note}`}</span>
          </div>
          <div className="absolute bottom-16 left-3 flex flex-wrap items-center gap-2 sm:bottom-4 sm:left-4">
            <button
              type="button"
              onClick={leaveWalk}
              className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-zinc-950 shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.97]"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              חזרה למבט על
            </button>
            <button
              type="button"
              onClick={leaveHome}
              className="flex items-center gap-1.5 rounded-full border border-white/25 bg-black/60 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur hover:border-white"
            >
              <Footprints className="h-3.5 w-3.5" aria-hidden="true" />
              לרחוב
            </button>
          </div>
        </>
      )}

      {selected === null && home === null && walking && (
        <>
          <div className={clsx(chip, 'pointer-events-none absolute left-1/2 top-3 flex max-w-[calc(100%-6rem)] -translate-x-1/2 flex-col items-center px-3.5 py-1.5 text-center')}>
            <span className="text-xs font-semibold sm:text-sm">הרחוב והלובי</span>
            <span className="flex items-center gap-1 text-2xs text-white/75">
              <Hand className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="sm:hidden">הקישו על הכניסה ותגיעו למעלית לבד</span>
              <span className="hidden sm:inline">הקישו על הכניסה, או לכו בעצמכם · W A S D או לחיצה על הקרקע</span>
            </span>
          </div>
          <div className="absolute bottom-16 left-3 flex flex-wrap items-center gap-2 sm:bottom-4 sm:left-4">
            <button
              type="button"
              onClick={leaveWalk}
              className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-zinc-950 shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.97]"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              חזרה למבט על
            </button>
            <button
              type="button"
              onClick={enterHome}
              className="flex items-center gap-1.5 rounded-full border border-white/25 bg-black/60 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur hover:border-white"
            >
              <Home className="h-3.5 w-3.5" aria-hidden="true" />
              לבניין המגורים
            </button>
          </div>
        </>
      )}

      {copy && selected !== null && walking && (
        <>
          <div className={clsx(chip, 'pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center whitespace-nowrap px-3.5 py-1.5 text-center')}>
            <span className="text-xs font-semibold sm:text-sm">
              קומה {selected + 1} · {copy.title}
            </span>
            <span className="flex items-center gap-1 text-2xs text-white/75">
              <Hand className="h-3 w-3" aria-hidden="true" />
              <span className="sm:hidden">גררו להסתכל · הקישו על הרצפה ללכת</span>
              <span className="hidden sm:inline">גררו כדי להסתכל, לחצו על הרצפה כדי ללכת · או W A S D</span>
            </span>
          </div>
          <div className="absolute bottom-16 left-3 flex flex-wrap items-center gap-2 sm:bottom-4 sm:left-4">
            <button
              type="button"
              onClick={leaveWalk}
              className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-zinc-950 shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.97]"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              לצאת מהקומה
            </button>
            <button
              type="button"
              onClick={() => choose(null)}
              className="flex items-center gap-1.5 rounded-full border border-white/25 bg-black/60 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur hover:border-white"
            >
              <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" />
              ירידה ללובי
            </button>
            <Link href={copy.href} className="rounded-full border border-white/25 bg-black/60 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur hover:border-white">
              {copy.cta}
            </Link>
          </div>
        </>
      )}

      {copy && selected !== null && !walking && (
        <section
          aria-live="polite"
          className="absolute inset-x-3 bottom-16 rounded-2xl border border-white/10 bg-black/75 p-3 text-white sm:p-4 shadow-2xl backdrop-blur-md sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-80"
        >
          <p className="text-2xs font-semibold text-violet-300">קומה {selected + 1}</p>
          <h2 className="mt-0.5 text-base font-bold sm:text-lg">{copy.title}</h2>
          <p className="mt-1.5 hidden text-sm leading-6 text-white/75 sm:block">{copy.text}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-3">
            {capable && ready && (
              <button
                type="button"
                onClick={() => setWalking(true)}
                className="flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-xs font-semibold text-accent-fg transition-transform hover:scale-[1.03] active:scale-[0.97]"
              >
                <Footprints className="h-3.5 w-3.5" aria-hidden="true" />
                להיכנס לקומה
              </button>
            )}
            <Link href={copy.href} className="rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-zinc-950 transition-transform hover:scale-[1.03] active:scale-[0.97]">
              {copy.cta}
            </Link>
            {program === 'offices' && (
              <Link href="/office" className="hidden rounded-full border border-white/25 px-3.5 py-2 text-xs font-semibold text-white hover:border-white sm:inline-flex">
                להיכנס למשרד בתלת־ממד
              </Link>
            )}
            <button type="button" onClick={() => choose(null)} className="ms-auto flex items-center gap-1 text-xs text-white/70 hover:text-white">
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              לכל הבניין
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
