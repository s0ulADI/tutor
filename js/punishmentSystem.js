import { SOUND_PACK_IDS } from "./stats.js";

const INTENSITY_PROFILES = [
  { name: "Chill", t2: 16, t3: 34, volume: 0.42, interval: 5200 },
  { name: "Normal", t2: 10, t3: 22, volume: 0.68, interval: 3600 },
  { name: "Chaotic", t2: 6, t3: 14, volume: 0.95, interval: 2200 }
];

// Pack metadata for the settings UI hint text.
export const PACK_HINTS = {
  alarm: "Classic Alarm: sirens, buzzers, urgent beeps.",
  cartoon: "Cartoon Chaos: slide whistles, boings, womp-womp.",
  meme: "Meme Pack: air horn, sting, record scratch, sad trombone.",
  retro: "Retro Computer: modem, error chime, floppy, game over.",
  sergeant: "Drill Sergeant: synthesized voice orders (no audio files).",
  minimal: "Chime only: one polite tone, never scary.",
  custom: "Custom: your own uploaded clips, kept in this browser."
};

// Drill Sergeant script lines per tier — generated speech, no audio files.
const SERGEANT_LINES = {
  1: [
    "Focus check. Get back here.",
    "Chair status: empty. Correct that.",
    "Eyes on the work, cadet."
  ],
  2: [
    "Focus check failed. Return immediately.",
    "This desk is not a suggestion. Get back here.",
    "You are falling out of formation. Move."
  ],
  3: [
    "Return to your desk right now. That is an order.",
    "Productivity failure detected. Move move move.",
    "Abandoned chair. Unacceptable. Return immediately."
  ]
};

export class PunishmentSystem {
  constructor() {
    this.audioContext = null;
    this.masterGain = null;
    this.enabled = true;
    this.currentTier = 0;
    this.intervalId = null;
    this.sirenNodes = [];
    this.howls = {};
    this.unlocked = false;
    this.soundPack = "alarm";
    this.customClips = [];
    this.customLoaded = false;
  }

  unlock() {
    if (this.unlocked) return;
    try {
      this.audioContext = this.audioContext || new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.75;
      this.masterGain.connect(this.audioContext.destination);
      if (this.audioContext.state === "suspended") this.audioContext.resume();
    } catch {
      /* audio unavailable — TTS/custom-file paths still work */
    }
    this.createHowls();
    this.unlocked = true;
    this.loadCustomClips();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (window.Howler) window.Howler.mute(!this.enabled);
    if (!this.enabled) this.stop();
  }

  setSoundPack(pack) {
    this.soundPack = SOUND_PACK_IDS.includes(pack) ? pack : "alarm";
    if (this.soundPack === "minimal" && this.currentTier === 3) {
      this.stop(false);
      this.start(2, { intensity: 0, roastMode: false });
    }
  }

  getProfile(intensity = 1) {
    return INTENSITY_PROFILES[Math.max(0, Math.min(2, Math.round(Number(intensity))))];
  }

  getTier(punishedSeconds, intensity = 1) {
    const profile = this.getProfile(intensity);
    if (punishedSeconds >= profile.t3) return 3;
    if (punishedSeconds >= profile.t2) return 2;
    if (punishedSeconds >= 0) return 1;
    return 0;
  }

  nudge(intensity = 1) {
    if (!this.enabled) return;
    this.unlock();
    this.playHowl("chime", this.getProfile(intensity).volume * 0.58);
  }

  start(tier, options = {}) {
    if (!this.enabled || tier <= 0) return;
    this.unlock();

    if (tier === this.currentTier) return;
    this.stop(false);
    this.currentTier = tier;

    const profile = this.getProfile(options.intensity);
    const pack = this.soundPack;
    // Tier escalation: lighter/quieter + slower at tier 1, full blast at 3.
    const tierVolume = profile.volume * (tier === 1 ? 0.7 : tier === 2 ? 0.88 : 1);
    const tierInterval = Math.max(1400, profile.interval - (tier - 1) * 900);

    if (pack === "sergeant") {
      this.speak(pick(SERGEANT_LINES[tier] || SERGEANT_LINES[1]));
      this.intervalId = window.setInterval(
        () => this.speak(pick(SERGEANT_LINES[tier] || SERGEANT_LINES[1])),
        Math.max(2600, tierInterval + 800)
      );
      return;
    }

    if (pack === "custom") {
      this.playCustom(tierVolume);
      this.intervalId = window.setInterval(() => this.playCustom(tierVolume), tierInterval);
      return;
    }

    if (pack === "minimal") {
      this.playHowl("chime", tierVolume);
      this.intervalId = window.setInterval(() => this.playHowl("chime", tierVolume), tierInterval);
      return;
    }

    // Synth packs: cycle/randomize 3-5 short clips so it never gets stale.
    this.playPackClip(pack, tier, tierVolume);
    this.intervalId = window.setInterval(() => this.playPackClip(pack, tier, tierVolume), tierInterval);

    if (pack === "alarm" && tier === 3) {
      this.startSiren(tierVolume);
      this.speak(options.roastMode ? "This chair has been abandoned with suspicious confidence." : "Away alarm active.");
    } else if (options.roastMode && tier >= 2) {
      this.speak("Return to your desk. The productivity committee is concerned.");
    }
  }

  // One-shot preview for the settings "Test" button. Never starts an interval.
  previewPack(pack = this.soundPack, tier = 2) {
    if (!this.enabled) return;
    this.unlock();
    this.stop(false);
    if (pack === "sergeant") {
      this.speak(pick(SERGEANT_LINES[tier] || SERGEANT_LINES[2]));
      return;
    }
    if (pack === "custom") {
      this.playCustom(0.8);
      return;
    }
    if (pack === "minimal" || pack === "alarm" || !pack) {
      this.playHowl(pack === "alarm" ? "squawk" : "chime", 0.7);
      if (pack === "alarm") this.playTone(660, 0.22, 0.4, "square");
      return;
    }
    this.playPackClip(pack, tier, 0.8);
  }

  playPackClip(pack, tier, volume) {
    const clips = PACK_CLIPS[pack] || PACK_CLIPS.alarm;
    // Tier 1 uses the gentlest clip; higher tiers randomize across the pack.
    const clip = tier === 1 ? clips[0] : pick(clips);
    try {
      clip(this, volume, tier);
    } catch {
      this.playHowl("chime", volume);
    }
  }

  relief() {
    if (!this.enabled) return;
    this.unlock();
    this.playArpeggio([523.25, 659.25, 783.99, 1046.5], 0.05, 0.1);
  }

  stop(cancelSpeech = true) {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.stopSiren();
    Object.values(this.howls).forEach((howl) => howl?.stop?.());
    if (cancelSpeech && window.speechSynthesis) window.speechSynthesis.cancel();
    this.currentTier = 0;
  }

  // ---- custom uploaded clips (IndexedDB, never uploaded anywhere) ----
  async loadCustomClips() {
    try {
      this.customClips = await listCustomSounds();
      this.customLoaded = true;
    } catch {
      this.customClips = [];
    }
    return this.customClips;
  }

  playCustom(volume = 0.8) {
    const clip = pick(this.customClips);
    if (!clip) {
      this.playHowl("chime", volume);
      return;
    }
    try {
      const audio = new Audio(clip.url);
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.play().catch(() => this.playHowl("chime", volume));
    } catch {
      this.playHowl("chime", volume);
    }
  }

  createHowls() {
    if (!window.Howl || this.howls.chime) return;
    this.howls.chime = new window.Howl({ src: [makeToneDataUri("chime")], html5: false });
    this.howls.squawk = new window.Howl({ src: [makeToneDataUri("squawk")], html5: false });
  }

  playHowl(name, volume) {
    if (!this.enabled) return;
    const howl = this.howls[name];
    if (howl) {
      howl.volume(Math.max(0, Math.min(1, volume)));
      howl.play();
      return;
    }
    this.playTone(name === "chime" ? 880 : 220, 0.18, volume);
  }

  playTone(frequency, duration, volume = 0.3, type = "sine", when = 0, slideTo = null) {
    if (!this.audioContext || !this.masterGain) return;
    const now = this.audioContext.currentTime + when;
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.masterGain);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  playArpeggio(frequencies, spacing, volume) {
    frequencies.forEach((frequency, index) => {
      window.setTimeout(() => this.playTone(frequency, 0.18, volume), index * spacing * 1000);
    });
  }

  startSiren(volume) {
    if (!this.audioContext || !this.masterGain) return;
    const now = this.audioContext.currentTime;
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const lfo = this.audioContext.createOscillator();
    const lfoGain = this.audioContext.createGain();

    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(520, now);
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(2.2, now);
    lfoGain.gain.setValueAtTime(260, now);
    gain.gain.setValueAtTime(Math.max(0.001, volume * 0.0001), now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume * 0.24), now + 0.25);

    lfo.connect(lfoGain);
    lfoGain.connect(oscillator.frequency);
    oscillator.connect(gain);
    gain.connect(this.masterGain);

    oscillator.start(now);
    lfo.start(now);
    this.sirenNodes = [oscillator, gain, lfo, lfoGain];
  }

  stopSiren() {
    const [oscillator, gain, lfo] = this.sirenNodes;
    if (!oscillator || !this.audioContext) return;
    const now = this.audioContext.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    oscillator.stop(now + 0.14);
    lfo?.stop(now + 0.14);
    this.sirenNodes = [];
  }

  speak(text) {
    if (!this.enabled || !window.speechSynthesis || !text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 1.35;
    utterance.volume = 0.75;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
}

// Procedural, royalty-free synth approximations of each pack's personality.
// 3-5 short clips per pack; tier scales volume/brightness via the caller.
const PACK_CLIPS = {
  alarm: [
    (p, v) => p.playTone(880, 0.18, v * 0.8),
    (p, v) => { p.playTone(660, 0.14, v, "square"); p.playTone(660, 0.14, v, "square", 0.18); },
    (p, v) => { p.playTone(520, 0.3, v, "sawtooth", 0, 780); },
    (p, v) => { p.playTone(440, 0.12, v, "square"); p.playTone(554, 0.12, v, "square", 0.14); p.playTone(659, 0.2, v, "square", 0.28); }
  ],
  cartoon: [
    (p, v) => p.playTone(300, 0.35, v, "sine", 0, 900),                    // slide whistle up
    (p, v) => p.playTone(800, 0.3, v, "sine", 0, 150),                     // slide down
    (p, v) => { p.playTone(392, 0.16, v, "triangle"); p.playTone(370, 0.16, v, "triangle", 0.17); p.playTone(349, 0.34, v, "triangle", 0.34); }, // womp womp
    (p, v) => { p.playTone(150, 0.25, v, "sine", 0, 60); p.playTone(400, 0.15, v, "sine", 0.2, 700); }, // boing-ish
    (p, v) => { p.playTone(200, 0.1, v, "square"); p.playTone(200, 0.1, v * 0.8, "square", 0.14); p.playTone(523, 0.3, v, "triangle", 0.28); } // drum sting
  ],
  meme: [
    (p, v) => { p.playTone(466, 0.4, v, "sawtooth"); p.playTone(587, 0.4, v * 0.8, "sawtooth"); }, // air-horn-ish blast
    (p, v) => { p.playTone(110, 0.5, v, "sawtooth"); p.playTone(116, 0.5, v * 0.7, "sawtooth"); },  // dramatic sting
    (p, v) => { for (let i = 0; i < 6; i += 1) p.playTone(300 + Math.random() * 1800, 0.05, v * 0.7, "square", i * 0.06); }, // record scratch-ish
    (p, v) => { p.playTone(233, 0.22, v, "triangle"); p.playTone(220, 0.22, v, "triangle", 0.24); p.playTone(208, 0.22, v, "triangle", 0.48); p.playTone(196, 0.5, v, "triangle", 0.72); }, // sad trombone
    (p, v) => { p.playTone(500, 0.12, v, "sine", 0, 900); p.playTone(700, 0.2, v * 0.8, "sine", 0.12, 1200); } // comedic gasp-ish
  ],
  retro: [
    (p, v) => { for (let i = 0; i < 8; i += 1) p.playTone(i % 2 ? 2250 : 1200, 0.09, v * 0.6, "square", i * 0.1); }, // modem handshake-ish
    (p, v) => { p.playTone(660, 0.15, v, "square"); p.playTone(440, 0.25, v, "square", 0.16); }, // error chime
    (p, v) => { for (let i = 0; i < 5; i += 1) p.playTone(180, 0.04, v * 0.7, "square", i * 0.09); }, // floppy clicks
    (p, v) => { [523, 392, 330, 262].forEach((f, i) => p.playTone(f, 0.2, v, "square", i * 0.2)); } // game over jingle
  ]
};

function pick(list) {
  if (!list?.length) return undefined;
  return list[Math.floor(Math.random() * list.length)];
}

// ---- tiny IndexedDB store for custom clips (local-only) ----
const CUSTOM_DB = "tutor-sounds";
const CUSTOM_STORE = "clips";

function openCustomDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = window.indexedDB.open(CUSTOM_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(CUSTOM_STORE, { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txPromise(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CUSTOM_STORE, mode);
    const store = tx.objectStore(CUSTOM_STORE);
    const out = fn(store);
    tx.oncomplete = () => resolve(out?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function listCustomSounds() {
  const db = await openCustomDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CUSTOM_STORE, "readonly");
    const request = tx.objectStore(CUSTOM_STORE).getAll();
    request.onsuccess = () => {
      const clips = (request.result || []).map((c) => ({
        id: c.id,
        name: c.name,
        url: URL.createObjectURL(c.blob)
      }));
      resolve(clips);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function addCustomSound(file) {
  const db = await openCustomDb();
  const record = { name: file.name || "custom clip", type: file.type, blob: file, addedAt: Date.now() };
  return txPromise(db, "readwrite", (store) => store.add(record));
}

export async function deleteCustomSound(id) {
  const db = await openCustomDb();
  return txPromise(db, "readwrite", (store) => store.delete(id));
}

function makeToneDataUri(type) {
  const sampleRate = 22050;
  const duration = type === "chime" ? 0.56 : 0.72;
  const length = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, length * 2, true);

  for (let index = 0; index < length; index += 1) {
    const t = index / sampleRate;
    const envelope = Math.pow(1 - index / length, type === "chime" ? 2.2 : 0.8);
    const frequency =
      type === "chime"
        ? 620 + Math.sin(t * 8) * 120
        : 170 + Math.sin(t * 38) * 95 + Math.sin(t * 7) * 55;
    const overtone = type === "chime" ? 1.5 : 2.7;
    const sample =
      Math.sin(Math.PI * 2 * frequency * t) * 0.72 +
      Math.sin(Math.PI * 2 * frequency * overtone * t) * 0.22;
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample * envelope)) * 32767, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function writeString(view, offset, string) {
  for (let index = 0; index < string.length; index += 1) {
    view.setUint8(offset + index, string.charCodeAt(index));
  }
}
