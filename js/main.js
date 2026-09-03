import { PresenceDetector, PRESENCE_STATES } from "./presenceDetector.js";
import { PunishmentSystem, addCustomSound, deleteCustomSound } from "./punishmentSystem.js";
import { TimerEngine } from "./timerEngine.js";
import { TutorUI } from "./ui.js";
import { clearHistory, loadHistory, loadSettings, saveSettings, saveSession } from "./stats.js";

const ui = new TutorUI();
const timer = new TimerEngine();
const punishment = new PunishmentSystem();
const detector = new PresenceDetector([ui.elements.setupVideo, ui.elements.activeVideo]);

let settings = loadSettings();
let history = loadHistory();
let sessionStats = createEmptySession();
let detectorStarted = false;
let completingSession = false;

ui.syncSettings(settings);
ui.renderQuickStats(history);
ui.renderStats(history);
punishment.setEnabled(settings.soundEnabled);
punishment.setSoundPack(settings.soundPack);
ui.updateSoundPackHint(settings.soundPack);
refreshCustomSounds();
detector.updateConfig({ graceSeconds: settings.graceSeconds });

wireButtons();
wireSettings();
wireDial();
wireTimer();
wirePresence();
wireSoundPreview();
renderIcons();

function wireButtons() {
  const byId = (id) => document.getElementById(id);

  byId("homeButton").addEventListener("click", () => ui.showScreen("landing"));
  byId("startSetupButton").addEventListener("click", () => ui.showScreen("setup"));
  byId("backToLandingButton").addEventListener("click", () => ui.showScreen("landing"));
  byId("statsButton").addEventListener("click", () => {
    ui.renderStats(history);
    ui.showScreen("stats");
  });
  byId("summaryStatsButton").addEventListener("click", () => {
    ui.renderStats(history);
    ui.showScreen("stats");
  });
  byId("statsBackButton").addEventListener("click", () => ui.showScreen(ui.previousScreen === "stats" ? "landing" : ui.previousScreen));
  byId("settingsButton").addEventListener("click", () => ui.openSettings());
  byId("closeSettingsButton").addEventListener("click", () => ui.closeSettings());
  byId("settingsDrawer").addEventListener("click", (event) => {
    if (event.target.id === "settingsDrawer") ui.closeSettings();
  });

  byId("enableCameraButton").addEventListener("click", () => ensureCamera());
  byId("beginSessionButton").addEventListener("click", beginSession);
  byId("pauseResumeButton").addEventListener("click", togglePause);
  byId("endSessionButton").addEventListener("click", () => finishSession(false));
  byId("newSessionButton").addEventListener("click", () => ui.showScreen("setup"));
  byId("downloadShareButton").addEventListener("click", () => ui.downloadShareCard());
  byId("demoChaosButton").addEventListener("click", previewChaos);
  byId("clearHistoryButton").addEventListener("click", () => {
    clearHistory();
    history = [];
    ui.renderQuickStats(history);
    ui.renderStats(history);
  });
}

function wireSettings() {
  const setupControls = [
    ui.elements.durationRange,
    ui.elements.breakIntervalSelect,
    ui.elements.breakLengthInput,
    ui.elements.intensitySelect,
    ui.elements.graceInput
  ];

  setupControls.forEach((control) => {
    control.addEventListener("input", () => {
      settings = saveSettings({ ...settings, ...ui.readSetupSettings() });
      ui.syncSettings(settings);
      applyLiveSettings();
    });
  });

  [
    ui.elements.sensitivityRange,
    ui.elements.settingsGraceInput,
    ui.elements.previewToggle,
    ui.elements.muteToggle,
    ui.elements.soundPackSelect,
    ui.elements.roastToggle
  ].forEach((control) => {
    control.addEventListener("input", () => {
      settings = saveSettings({ ...settings, ...ui.readDrawerSettings() });
      ui.syncSettings(settings);
      applyLiveSettings();
    });
  });
}

function wireDial() {
  const dial = ui.elements.durationDial;
  let dragging = false;

  const setFromPointer = (event) => {
    const rect = dial.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const radians = Math.atan2(dy, dx) + Math.PI / 2;
    const normalized = (radians + Math.PI * 2) % (Math.PI * 2);
    const minutes = Math.round((5 + (normalized / (Math.PI * 2)) * 115) / 5) * 5;
    settings = saveSettings({ ...settings, durationMinutes: minutes });
    ui.syncSettings(settings);
  };

  dial.addEventListener("pointerdown", (event) => {
    dragging = true;
    dial.setPointerCapture(event.pointerId);
    setFromPointer(event);
  });
  dial.addEventListener("pointermove", (event) => {
    if (dragging) setFromPointer(event);
  });
  dial.addEventListener("pointerup", () => {
    dragging = false;
  });
  dial.addEventListener("keydown", (event) => {
    if (!["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) return;
    event.preventDefault();
    const direction = ["ArrowUp", "ArrowRight"].includes(event.key) ? 5 : -5;
    const minutes = Math.max(5, Math.min(120, Number(settings.durationMinutes) + direction));
    settings = saveSettings({ ...settings, durationMinutes: minutes });
    ui.syncSettings(settings);
  });
}

function wireTimer() {
  timer.addEventListener("start", ({ detail }) => {
    ui.updateTimer(detail);
    ui.updatePauseButton(false);
  });

  timer.addEventListener("tick", ({ detail }) => {
    ui.updateTimer(detail);
    updateMonitoring(detail);
    collectSessionStats(detail);
  });

  timer.addEventListener("phasechange", ({ detail }) => {
    updateMonitoring(detail);
    if (detail.phase === "break") {
      punishment.stop();
      ui.clearPunishment();
      ui.updateCameraStatus("Break mode", "Punishments are disabled until focus resumes.");
    }
  });

  timer.addEventListener("pause", ({ detail }) => {
    ui.updateTimer(detail);
    ui.updatePauseButton(true);
    detector.setMonitoring(false);
    punishment.stop();
    ui.clearPunishment();
  });

  timer.addEventListener("resume", ({ detail }) => {
    ui.updateTimer(detail);
    ui.updatePauseButton(false);
    updateMonitoring(detail);
  });

  timer.addEventListener("end", ({ detail }) => {
    if (completingSession) return;
    finishSession(detail.completed);
  });
}

function wirePresence() {
  detector.addEventListener("status", ({ detail }) => {
    ui.updateCameraStatus(detail.mode === "face" ? "Face detector armed" : "Motion fallback armed", detail.message);
  });

  detector.addEventListener("statechange", ({ detail }) => {
    if (detail.state !== PRESENCE_STATES.PRESENT && detail.previousState === PRESENCE_STATES.PRESENT && isFocusMonitoring()) {
      sessionStats.disappearances += 1;
      sessionStats.currentStreakSeconds = 0;
      punishment.nudge(settings.intensity);
      ui.showNudge();
    }

    if (detail.state === PRESENCE_STATES.PRESENT && detail.previousState !== PRESENCE_STATES.PRESENT && isFocusMonitoring()) {
      punishment.stop();
      punishment.relief();
      ui.celebrate();
    }
  });

  detector.addEventListener("sample", ({ detail }) => {
    ui.updatePresence(detail);
    if (!isFocusMonitoring()) return;

    if (detail.state === PRESENCE_STATES.AWAY_PUNISHED) {
      const punishedSeconds = Math.max(0, detail.awaySeconds - settings.graceSeconds);
      const tier = punishment.getTier(punishedSeconds, settings.intensity);
      punishment.start(tier, { intensity: settings.intensity, roastMode: settings.roastMode });
      ui.showPunishment(tier, detail.awaySeconds);
    }

    if (detail.state === PRESENCE_STATES.PRESENT) {
      ui.clearPunishment();
    }
  });
}

async function beginSession() {
  punishment.unlock();
  settings = saveSettings({ ...settings, ...ui.readSetupSettings() });
  ui.syncSettings(settings);
  applyLiveSettings();

  try {
    await ensureCamera();
  } catch {
    ui.updateCameraStatus("Camera unavailable", "Timer can run, but camera enforcement is disabled.");
  }

  sessionStats = createEmptySession();
  completingSession = false;
  ui.clearPunishment();
  ui.showScreen("active");
  ui.elements.activeVideo.play().catch(() => undefined);
  timer.start(settings);
}

async function ensureCamera() {
  if (detectorStarted) return;
  ui.updateCameraStatus("Camera warming up", "Requesting local webcam access.");
  try {
    const result = await detector.start();
    detectorStarted = true;
    ui.updateCameraStatus(
      result.mode === "face" ? "Face detector armed" : "Motion fallback armed",
      result.mode === "face" ? "Local face presence is active." : "Local motion fallback is active."
    );
  } catch (error) {
    detectorStarted = false;
    ui.updateCameraStatus("Camera blocked", error.message || "Webcam permission was not granted.");
    throw error;
  }
}

function togglePause() {
  if (timer.status === "running") timer.pause();
  else if (timer.status === "paused") timer.resume();
}

function finishSession(completed) {
  completingSession = true;
  timer.end(completed);
  detector.setMonitoring(false);
  punishment.stop();
  ui.clearPunishment();
  document.body.classList.remove("break-mode");

  const summary = saveSession({
    ...sessionStats,
    completed,
    focusedSeconds: Math.min(sessionStats.focusedSeconds, sessionStats.plannedSeconds)
  });

  history = loadHistory();
  ui.renderSummary(summary);
  ui.renderQuickStats(history);
  ui.renderStats(history);
  ui.showScreen("summary");
  completingSession = false;
}

function updateMonitoring(snapshot) {
  detector.setMonitoring(snapshot.status === "running" && snapshot.phase === "focus");
}

function collectSessionStats(snapshot) {
  if (snapshot.status !== "running" || snapshot.phase !== "focus" || snapshot.deltaSeconds <= 0) return;
  const present = detector.state === PRESENCE_STATES.PRESENT;
  sessionStats.plannedSeconds = snapshot.durationSeconds;

  if (present) {
    sessionStats.focusedSeconds += snapshot.deltaSeconds;
    sessionStats.currentStreakSeconds += snapshot.deltaSeconds;
    sessionStats.longestStreakSeconds = Math.max(sessionStats.longestStreakSeconds, sessionStats.currentStreakSeconds);
  } else {
    sessionStats.awaySeconds += snapshot.deltaSeconds;
    sessionStats.currentStreakSeconds = 0;
  }

  ui.updateStreak(sessionStats.currentStreakSeconds, snapshot.durationSeconds);
}

function applyLiveSettings() {
  detector.updateConfig({ graceSeconds: settings.graceSeconds });
  punishment.setEnabled(settings.soundEnabled);
  punishment.setSoundPack(settings.soundPack);
  ui.syncSettings(settings);
  ui.updateSoundPackHint(settings.soundPack);
}

// Part 2.6 + Part 3: sound pack test button with playing indicator,
// custom clip uploads (local-only), and per-clip removal.
function wireSoundPreview() {
  const previewButton = ui.elements.soundPreviewButton;
  if (previewButton) {
    previewButton.addEventListener("click", () => {
      punishment.unlock();
      punishment.previewPack(settings.soundPack, 2);
      ui.setPreviewPlaying(true);
      renderIcons();
      window.setTimeout(() => ui.setPreviewPlaying(false), 1800);
    });
  }

  const packSelect = ui.elements.soundPackSelect;
  if (packSelect) {
    packSelect.addEventListener("change", () => {
      ui.updateSoundPackHint(packSelect.value);
      if (packSelect.value === "custom") refreshCustomSounds();
    });
  }

  const fileInput = ui.elements.customSoundInput;
  if (fileInput) {
    fileInput.addEventListener("change", async () => {
      const files = [...(fileInput.files || [])].slice(0, 5);
      for (const file of files) {
        if (!file.type.startsWith("audio")) continue;
        if (file.size > 4 * 1024 * 1024) {
          ui.showSessionToast(`"${file.name}" is over 4MB — kept it out.`);
          continue;
        }
        try {
          await addCustomSound(file);
        } catch {
          ui.showSessionToast("Could not store that clip in this browser.");
        }
      }
      fileInput.value = "";
      await refreshCustomSounds();
      renderIcons();
    });
  }

  const soundList = ui.elements.customSoundList;
  if (soundList) {
    soundList.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-delete-sound]");
      if (!button) return;
      try {
        await deleteCustomSound(Number(button.dataset.deleteSound));
      } catch {
        /* ignore */
      }
      await refreshCustomSounds();
    });
  }
}

async function refreshCustomSounds() {
  try {
    const clips = await punishment.loadCustomClips();
    ui.renderCustomSounds(clips);
  } catch {
    ui.renderCustomSounds([]);
  }
}

function isFocusMonitoring() {
  const snapshot = timer.snapshot(0);
  return snapshot.status === "running" && snapshot.phase === "focus";
}

function createEmptySession() {
  return {
    startedAt: new Date().toISOString(),
    plannedSeconds: settings.durationMinutes * 60,
    focusedSeconds: 0,
    awaySeconds: 0,
    disappearances: 0,
    longestStreakSeconds: 0,
    currentStreakSeconds: 0
  };
}

function previewChaos() {
  punishment.unlock();
  ui.showPunishment(3, 29);
  punishment.start(3, { intensity: 2, roastMode: true });
  window.setTimeout(() => {
    punishment.stop();
    punishment.relief();
    ui.celebrate();
  }, 4200);
}

function renderIcons() {
  if (window.lucide) window.lucide.createIcons();
}
