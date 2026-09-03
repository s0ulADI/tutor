const SETTINGS_KEY = "tutor.settings.v1";
const HISTORY_KEY = "tutor.history.v1";
const STREAK_KEY = "tutor.dailyStreak.v1";

export const SOUND_PACKS = [
  { id: "alarm", name: "Classic Alarm" },
  { id: "cartoon", name: "Cartoon Chaos" },
  { id: "meme", name: "Meme Pack" },
  { id: "retro", name: "Retro Computer" },
  { id: "sergeant", name: "Drill Sergeant" },
  { id: "minimal", name: "Chime only" },
  { id: "custom", name: "Custom (my uploads)" }
];

export const SOUND_PACK_IDS = SOUND_PACKS.map((p) => p.id);

export const DEFAULT_SETTINGS = {
  durationMinutes: 25,
  breakIntervalMinutes: 0,
  breakLengthMinutes: 5,
  graceSeconds: 7,
  intensity: 1,
  previewEnabled: true,
  soundEnabled: true,
  soundPack: "alarm",
  roastMode: false
};

export function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...stored });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function normalizeSettings(settings) {
  return {
    durationMinutes: clampNumber(settings.durationMinutes, 5, 120, DEFAULT_SETTINGS.durationMinutes),
    breakIntervalMinutes: clampNumber(settings.breakIntervalMinutes, 0, 90, DEFAULT_SETTINGS.breakIntervalMinutes),
    breakLengthMinutes: clampNumber(settings.breakLengthMinutes, 1, 15, DEFAULT_SETTINGS.breakLengthMinutes),
    graceSeconds: clampNumber(settings.graceSeconds, 2, 30, DEFAULT_SETTINGS.graceSeconds),
    intensity: clampNumber(settings.intensity, 0, 2, DEFAULT_SETTINGS.intensity),
    previewEnabled: Boolean(settings.previewEnabled),
    soundEnabled: Boolean(settings.soundEnabled),
    soundPack: SOUND_PACK_IDS.includes(settings.soundPack) ? settings.soundPack : DEFAULT_SETTINGS.soundPack,
    roastMode: Boolean(settings.roastMode)
  };
}

export function loadHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

export function saveSession(session) {
  const history = loadHistory();
  const entry = {
    id: crypto?.randomUUID?.() || String(Date.now()),
    startedAt: session.startedAt,
    endedAt: new Date().toISOString(),
    plannedSeconds: Math.round(session.plannedSeconds || 0),
    focusedSeconds: Math.round(session.focusedSeconds || 0),
    awaySeconds: Math.round(session.awaySeconds || 0),
    disappearances: Math.round(session.disappearances || 0),
    longestStreakSeconds: Math.round(session.longestStreakSeconds || 0),
    completed: Boolean(session.completed),
    focusPercent: calculateFocusPercent(session),
    shameScore: calculateShameScore(session),
    badge: chooseBadge(session)
  };

  history.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 40)));
  updateDailyStreak(entry.endedAt);
  return entry;
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

export function loadDailyStreak() {
  try {
    const stored = JSON.parse(localStorage.getItem(STREAK_KEY) || "{}");
    return {
      count: Math.max(0, Number(stored.count || 0)),
      lastDate: stored.lastDate || null
    };
  } catch {
    return { count: 0, lastDate: null };
  }
}

export function updateDailyStreak(isoDate = new Date().toISOString()) {
  const today = toDateKey(isoDate);
  const streak = loadDailyStreak();

  if (streak.lastDate === today) {
    return streak;
  }

  const yesterday = toDateKey(new Date(new Date(isoDate).getTime() - 86400000));
  const nextCount = streak.lastDate === yesterday ? streak.count + 1 : 1;
  const next = { count: nextCount, lastDate: today };
  localStorage.setItem(STREAK_KEY, JSON.stringify(next));
  return next;
}

export function getDailyStreakDisplay() {
  const streak = loadDailyStreak();
  const today = toDateKey(new Date());
  const yesterday = toDateKey(new Date(Date.now() - 86400000));

  if (streak.lastDate === today || streak.lastDate === yesterday) {
    return streak.count;
  }

  return 0;
}

export function getAggregateStats(history = loadHistory()) {
  if (!history.length) {
    return {
      sessions: 0,
      averageFocusPercent: 0,
      totalFocusedSeconds: 0,
      bestStreakSeconds: 0,
      disappearances: 0
    };
  }

  const totals = history.reduce(
    (acc, item) => {
      acc.focusPercent += Number(item.focusPercent || 0);
      acc.focusedSeconds += Number(item.focusedSeconds || 0);
      acc.bestStreakSeconds = Math.max(acc.bestStreakSeconds, Number(item.longestStreakSeconds || 0));
      acc.disappearances += Number(item.disappearances || 0);
      return acc;
    },
    { focusPercent: 0, focusedSeconds: 0, bestStreakSeconds: 0, disappearances: 0 }
  );

  return {
    sessions: history.length,
    averageFocusPercent: Math.round(totals.focusPercent / history.length),
    totalFocusedSeconds: totals.focusedSeconds,
    bestStreakSeconds: totals.bestStreakSeconds,
    disappearances: totals.disappearances
  };
}

export function calculateFocusPercent(session) {
  const planned = Math.max(1, Number(session.plannedSeconds || 0));
  const focused = Math.max(0, Number(session.focusedSeconds || 0));
  return Math.min(100, Math.round((focused / planned) * 100));
}

export function calculateShameScore(session) {
  const awayPenalty = Math.round(Number(session.awaySeconds || 0) / 5);
  const vanishPenalty = Number(session.disappearances || 0) * 12;
  const incompletePenalty = session.completed ? 0 : 15;
  return Math.max(0, Math.min(999, awayPenalty + vanishPenalty + incompletePenalty));
}

export function chooseBadge(session) {
  const focus = calculateFocusPercent(session);
  const vanishes = Number(session.disappearances || 0);

  if (focus >= 95 && vanishes === 0) return "Chair Champion";
  if (focus >= 90) return "Focus Ninja";
  if (focus >= 75) return "Mostly Here";
  if (vanishes >= 5) return "Serial Disappearer";
  return "Reformed Wanderer";
}

export function formatDuration(seconds) {
  // Fix (bug #4): hours branch now pads minutes to two digits ("5h 00m",
  // not "5h 0m"), keeping the unit labels single and aligned.
  const safeSeconds = Math.max(0, Math.round(Number(seconds || 0)));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const leftoverMinutes = String(minutes % 60).padStart(2, "0");
    return `${hours}h ${leftoverMinutes}m`;
  }

  if (minutes > 0) return `${minutes}m`;
  return `${remainingSeconds}s`;
}

export const ALL_BADGES = [
  { name: "Chair Champion", icon: "🏆", hint: "95%+ focus with zero vanishes" },
  { name: "Focus Ninja", icon: "🥷", hint: "90%+ focus in a session" },
  { name: "Mostly Here", icon: "🙂", hint: "75%+ focus in a session" },
  { name: "Reformed Wanderer", icon: "🚶", hint: "Finish a session below 75%" },
  { name: "Serial Disappearer", icon: "👻", hint: "Vanish 5+ times in one session" }
];

const UNLOCKED_BADGES_KEY = "tutor.badges.v1";

export function getEarnedBadges(history = []) {
  const earned = new Set();
  history.forEach((item) => {
    if (item?.badge) earned.add(item.badge);
  });
  return [...earned];
}

export function loadUnlockedBadges() {
  try {
    const stored = JSON.parse(localStorage.getItem(UNLOCKED_BADGES_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter((b) => typeof b === "string") : [];
  } catch {
    return [];
  }
}

export function saveUnlockedBadges(badges) {
  try {
    localStorage.setItem(UNLOCKED_BADGES_KEY, JSON.stringify([...new Set(badges)]));
  } catch {
    /* storage full or unavailable — badges simply won't persist */
  }
  return badges;
}

// Daily activity for the heatmap: map of YYYY-MM-DD -> { sessions, focusedSeconds }
export function getDailyActivity(history = [], days = 56) {
  const map = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 86400000);
    map[toDateKey(d)] = { sessions: 0, focusedSeconds: 0, date: new Date(d) };
  }
  history.forEach((item) => {
    const key = toDateKey(item.endedAt || item.startedAt || new Date());
    if (map[key]) {
      map[key].sessions += 1;
      map[key].focusedSeconds += Number(item.focusedSeconds || 0);
    }
  });
  return Object.entries(map)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => ({ key, ...value }));
}

export function formatClock(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(Number(seconds || 0)));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function toDateKey(isoDate) {
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
