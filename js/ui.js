import {
  ALL_BADGES,
  formatClock,
  formatDuration,
  getAggregateStats,
  getDailyActivity,
  getDailyStreakDisplay,
  getEarnedBadges,
  loadUnlockedBadges,
  saveUnlockedBadges
} from "./stats.js";
import { PACK_HINTS } from "./punishmentSystem.js";

const SCREEN_IDS = {
  landing: "landingScreen",
  setup: "setupScreen",
  active: "activeScreen",
  summary: "summaryScreen",
  stats: "statsScreen"
};

const INTENSITY_LABELS = ["Chill", "Normal", "Chaotic"];
const MESSAGES = [
  "Steady mode engaged",
  "Chair integrity: excellent",
  "Momentum is building",
  "Tiny wins count",
  "Keep the streak alive",
  "Tutor approves"
];

const PUNISHMENT_COPY = {
  1: {
    title: "Hey... where did you go?",
    message: "The grace timer has expired. Re-enter the frame to restore peace."
  },
  2: {
    title: "Desk abandonment detected.",
    message: "Tutor has upgraded from concerned to dramatically disappointed."
  },
  3: {
    title: "Productivity siren active.",
    message: "This fake report is being fake-filed with fake urgency."
  }
};

const BADGE_ICONS = {
  "Chair Champion": "🏆",
  "Focus Ninja": "🥷",
  "Mostly Here": "🙂",
  "Serial Disappearer": "👻",
  "Reformed Wanderer": "🚶"
};

const STAT_ICONS = ["📚", "🎯", "⏳", "🔥"];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

export class TutorUI {
  constructor() {
    this.screen = "landing";
    this.previousScreen = "landing";
    this.messageTimer = null;
    this.toastTimer = null;
    this.particleFrame = null;
    this.particles = [];
    this.energy = 1; // Part 2.4: 1 = calm drift, 3 = chaos mode
    this.lastSummary = null;
    this.revealObserver = null;
    this.magneticButtons = new Map();
    this.tiltCards = new Map();
    this.mascotReactionTimer = null;
    this.elements = this.getElements();
    this.bindCursor();
    this.bindMascot();
    this.bindNoSelect();
    this.initHeroParticles();
    this.initStatsSparkles();
    this.initHeadlineReveal();
    this.initScrollReveals();
    this.initMagneticButtons();
    this.initCardTilt();
    this.initMascotReactions();
  }

  getElements() {
    const byId = (id) => document.getElementById(id);
    return {
      cursorDot: byId("cursorDot"),
      mascotStage: byId("mascotStage"),
      mascotBubble: byId("mascotBubble"),
      durationDial: byId("durationDial"),
      dialThumb: byId("dialThumb"),
      durationRange: byId("durationRange"),
      durationValue: byId("durationValue"),
      breakIntervalSelect: byId("breakIntervalSelect"),
      breakLengthInput: byId("breakLengthInput"),
      intensitySelect: byId("intensitySelect"),
      graceInput: byId("graceInput"),
      settingsDrawer: byId("settingsDrawer"),
      sensitivityRange: byId("sensitivityRange"),
      sensitivityLabel: byId("sensitivityLabel"),
      settingsGraceInput: byId("settingsGraceInput"),
      previewToggle: byId("previewToggle"),
      muteToggle: byId("muteToggle"),
      soundPackSelect: byId("soundPackSelect"),
      roastToggle: byId("roastToggle"),
      setupVideo: byId("setupVideo"),
      activeVideo: byId("activeVideo"),
      cameraStatusTitle: byId("cameraStatusTitle"),
      cameraStatusCopy: byId("cameraStatusCopy"),
      setupPresenceGlow: byId("setupPresenceGlow"),
      activePresenceGlow: byId("activePresenceGlow"),
      progressRing: byId("progressRing"),
      timeReadout: byId("timeReadout"),
      phaseLabel: byId("phaseLabel"),
      phaseEyebrow: byId("phaseEyebrow"),
      pauseResumeButton: byId("pauseResumeButton"),
      presenceDot: byId("presenceDot"),
      presenceLabel: byId("presenceLabel"),
      detectionMode: byId("detectionMode"),
      streakValue: byId("streakValue"),
      streakFill: byId("streakFill"),
      ambientFeed: byId("ambientFeed"),
      ambientMessageTemplate: byId("ambientMessageTemplate"),
      punishmentOverlay: byId("punishmentOverlay"),
      punishmentTier: byId("punishmentTier"),
      punishmentTitle: byId("punishmentTitle"),
      punishmentMessage: byId("punishmentMessage"),
      shareCard: byId("shareCard"),
      summaryBadge: byId("summaryBadge"),
      summaryFocusPercent: byId("summaryFocusPercent"),
      summaryFocused: byId("summaryFocused"),
      summaryVanishes: byId("summaryVanishes"),
      summaryLongest: byId("summaryLongest"),
      summaryShame: byId("summaryShame"),
      quickSessions: byId("quickSessions"),
      quickFocus: byId("quickFocus"),
      quickStreak: byId("quickStreak"),
      quickDailyStreak: byId("quickDailyStreak"),
      heroParticles: byId("heroParticles"),
      sessionToast: byId("sessionToast"),
      activeTitle: byId("activeTitle"),
      downloadShareButton: byId("downloadShareButton"),
      statsSummary: byId("statsSummary"),
      historyList: byId("historyList"),
      statsSparkles: byId("statsSparkles"),
      heatmapGrid: byId("heatmapGrid"),
      focusChart: byId("focusChart"),
      badgeGrid: byId("badgeGrid"),
      badgeCount: byId("badgeCount"),
      soundPreviewButton: byId("soundPreviewButton"),
      soundPackHint: byId("soundPackHint"),
      customSoundsField: byId("customSoundsField"),
      customSoundInput: byId("customSoundInput"),
      customSoundList: byId("customSoundList")
    };
  }

  bindNoSelect() {
    document.addEventListener("selectstart", (event) => {
      if (!event.target.closest("input, textarea, select")) {
        event.preventDefault();
      }
    });
    document.addEventListener("dragstart", (event) => {
      if (!event.target.closest("input, textarea, select")) {
        event.preventDefault();
      }
    });
  }

  showScreen(name) {
    if (!SCREEN_IDS[name]) return;
    const previous = this.screen;
    this.previousScreen = previous;
    this.screen = name;

    const outgoing = document.getElementById(SCREEN_IDS[previous]);
    const incoming = document.getElementById(SCREEN_IDS[name]);

    Object.entries(SCREEN_IDS).forEach(([screenName, id]) => {
      document.getElementById(id)?.classList.toggle("is-active", screenName === name);
    });

    if (window.gsap && outgoing && incoming && previous !== name) {
      window.gsap.fromTo(
        incoming,
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.42, ease: "power2.out" }
      );
    }

    if (name === "active") this.startAmbientMessages();
    else this.stopAmbientMessages();
    if (name === "landing") this.startHeroParticles();
    else this.stopHeroParticles();
    if (name === "stats") this.animateStatsPanel();
    if (name === "landing") this.animateLandingCards();
    if (name === "setup") this.initSetupScrollReveals();
    if (name === "summary") this.initSummaryScrollReveals();
  }

  initSetupScrollReveals() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const elements = document.querySelectorAll("#setupScreen .setup-grid > *");
    elements.forEach((el, i) => {
      el.classList.add("reveal-on-scroll");
      el.classList.add(`stagger-${Math.min(i + 1, 6)}`);
      if (this.revealObserver) this.revealObserver.observe(el);
    });
  }

  initSummaryScrollReveals() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const elements = document.querySelectorAll("#summaryScreen .summary-layout > *");
    elements.forEach((el, i) => {
      el.classList.add("reveal-on-scroll");
      el.classList.add(`stagger-${Math.min(i + 1, 6)}`);
      if (this.revealObserver) this.revealObserver.observe(el);
    });
  }

  openSettings() {
    this.elements.settingsDrawer.classList.add("is-open");
    this.elements.settingsDrawer.setAttribute("aria-hidden", "false");
  }

  closeSettings() {
    this.elements.settingsDrawer.classList.remove("is-open");
    this.elements.settingsDrawer.setAttribute("aria-hidden", "true");
  }

  bindMascot() {
    const stage = this.elements.mascotStage;
    if (!stage) return;
    stage.addEventListener("pointermove", (event) => {
      const box = stage.getBoundingClientRect();
      const x = ((event.clientX - box.left) / box.width - 0.5) * 24;
      const y = ((event.clientY - box.top) / box.height - 0.5) * 18;
      stage.style.setProperty("--mascot-x", `${x}px`);
      stage.style.setProperty("--mascot-y", `${y}px`);
    });
    stage.addEventListener("pointerleave", () => {
      stage.style.setProperty("--mascot-x", "0px");
      stage.style.setProperty("--mascot-y", "0px");
    });
  }

  syncSettings(settings) {
    this.elements.durationRange.value = settings.durationMinutes;
    this.elements.breakIntervalSelect.value = String(settings.breakIntervalMinutes);
    this.elements.breakLengthInput.value = settings.breakLengthMinutes;
    this.elements.intensitySelect.value = String(settings.intensity);
    this.elements.graceInput.value = settings.graceSeconds;
    this.elements.sensitivityRange.value = settings.intensity;
    this.elements.sensitivityLabel.textContent = INTENSITY_LABELS[settings.intensity];
    this.elements.settingsGraceInput.value = settings.graceSeconds;
    this.elements.previewToggle.checked = settings.previewEnabled;
    this.elements.muteToggle.checked = settings.soundEnabled;
    this.elements.soundPackSelect.value = settings.soundPack;
    this.elements.roastToggle.checked = settings.roastMode;
    this.updateDurationDial(settings.durationMinutes);
    document.body.classList.toggle("preview-hidden", !settings.previewEnabled);
  }

  readSetupSettings() {
    return {
      durationMinutes: Number(this.elements.durationRange.value),
      breakIntervalMinutes: Number(this.elements.breakIntervalSelect.value),
      breakLengthMinutes: Number(this.elements.breakLengthInput.value),
      intensity: Number(this.elements.intensitySelect.value),
      graceSeconds: Number(this.elements.graceInput.value)
    };
  }

  readDrawerSettings() {
    return {
      intensity: Number(this.elements.sensitivityRange.value),
      graceSeconds: Number(this.elements.settingsGraceInput.value),
      previewEnabled: this.elements.previewToggle.checked,
      soundEnabled: this.elements.muteToggle.checked,
      soundPack: this.elements.soundPackSelect.value,
      roastMode: this.elements.roastToggle.checked
    };
  }

  updateDurationDial(minutes) {
    const clamped = Math.max(5, Math.min(120, Number(minutes)));
    const progress = ((clamped - 5) / 115) * 360;
    this.elements.durationValue.textContent = String(clamped);
    this.elements.durationRange.value = clamped;
    this.elements.durationDial.style.setProperty("--dial-progress", `${progress}deg`);
    this.elements.durationDial.setAttribute("aria-valuenow", String(clamped));
  }

  updateTimer(snapshot) {
    const remaining = snapshot.activeRemainingSeconds;
    const progressDegrees = Math.round(snapshot.progress * 360);
    this.elements.progressRing.style.setProperty("--progress", `${progressDegrees}deg`);
    this.elements.timeReadout.textContent = formatClock(remaining);
    this.elements.phaseLabel.textContent = snapshot.phase === "break" ? "Break time" : "Focus time";
    this.elements.phaseEyebrow.textContent = snapshot.phase === "break" ? "Break mode" : "Focus mode";
    this.elements.activeTitle.textContent =
      snapshot.phase === "break" ? "Stretch. Breathe. No punishments." : "Stay in frame. Stay in flow.";
    document.body.classList.toggle("break-mode", snapshot.phase === "break");
  }

  updatePauseButton(paused) {
    const icon = this.elements.pauseResumeButton.querySelector("svg");
    this.elements.pauseResumeButton.setAttribute("aria-label", paused ? "Resume session" : "Pause session");
    if (icon && window.lucide) {
      this.elements.pauseResumeButton.innerHTML = `<i data-lucide="${paused ? "play" : "pause"}" aria-hidden="true"></i>`;
      window.lucide.createIcons();
    }
  }

  updatePresence(detail) {
    const isPresent = detail.state === "PRESENT";
    const isGrace = detail.state === "AWAY_GRACE";
    const label = isPresent ? "Present" : isGrace ? "Away grace" : "Away punished";
    const mode = detail.mode === "face" ? "Face detector" : detail.mode === "motion" ? "Motion fallback" : "Detector standby";

    this.elements.presenceLabel.textContent = label;
    this.elements.detectionMode.textContent = mode;
    this.elements.presenceDot.className = `status-dot ${isPresent ? "present" : isGrace ? "grace" : "away"}`;
    this.elements.setupPresenceGlow.className = `presence-glow ${isPresent ? "" : isGrace ? "idle" : "away"}`;
    this.elements.activePresenceGlow.className = `presence-glow ${isPresent ? "" : isGrace ? "idle" : "away"}`;
  }

  updateCameraStatus(title, copy) {
    this.elements.cameraStatusTitle.textContent = title;
    this.elements.cameraStatusCopy.textContent = copy;
  }

  updateStreak(seconds, plannedSeconds) {
    this.elements.streakValue.textContent = formatClock(seconds);
    const progress = Math.min(100, (seconds / Math.max(60, plannedSeconds)) * 100);
    this.elements.streakFill.style.setProperty("--streak-progress", `${progress}%`);
  }

  showNudge() {
    this.showSessionToast("The chair is looking lonely.");
    this.elements.mascotBubble.textContent = "The chair is looking lonely.";
    window.setTimeout(() => {
      this.elements.mascotBubble.textContent = "I am watching the chair.";
    }, 2600);
  }

  showPunishment(tier, awaySeconds) {
    const copy = PUNISHMENT_COPY[tier] || PUNISHMENT_COPY[1];
    this.elements.punishmentTier.textContent = `Tier ${tier} - away ${Math.round(awaySeconds)}s`;
    this.elements.punishmentTitle.textContent = copy.title;
    this.elements.punishmentMessage.textContent = copy.message;
    this.elements.punishmentOverlay.classList.add("is-visible");
    this.elements.punishmentOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.toggle("punishment-tier-1", tier === 1);
    document.body.classList.toggle("punishment-tier-2", tier === 2);
    document.body.classList.toggle("punishment-tier-3", tier === 3);
    // Part 2.4: landing background reacts — chaos mode energizes particles.
    document.body.classList.add("chaos-live");
    this.energy = 3;

    if (window.gsap) {
      window.gsap.fromTo(
        this.elements.punishmentOverlay.querySelector(".punishment-copy"),
        { scale: 0.92, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.28, ease: "back.out(1.6)" }
      );
    }
  }

  clearPunishment() {
    this.elements.punishmentOverlay.classList.remove("is-visible");
    this.elements.punishmentOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("punishment-tier-1", "punishment-tier-2", "punishment-tier-3");
    document.body.classList.remove("chaos-live");
    this.energy = 1;
  }

  celebrate() {
    this.clearPunishment();
    this.showSessionToast("Welcome back! Peace restored.");
    this.elements.mascotBubble.textContent = "Welcome back. Peace restored.";
    window.setTimeout(() => {
      this.elements.mascotBubble.textContent = "I am watching the chair.";
    }, 2600);

    if (window.confetti) {
      window.confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.66 },
        colors: ["#21f4e8", "#ff5a69", "#baff29", "#ffd166"]
      });
    }
  }

  showSessionToast(message) {
    const toast = this.elements.sessionToast;
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.add("is-visible");
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      window.setTimeout(() => {
        toast.hidden = true;
      }, 320);
    }, 2800);
  }

  renderQuickStats(history) {
    const aggregate = getAggregateStats(history);
    this.elements.quickSessions.textContent = String(aggregate.sessions);
    this.elements.quickFocus.textContent = `${aggregate.averageFocusPercent}%`;
    this.elements.quickStreak.textContent = formatDuration(aggregate.bestStreakSeconds);
    if (this.elements.quickDailyStreak) {
      this.elements.quickDailyStreak.textContent = String(getDailyStreakDisplay());
    }
    this.animateLandingCards();
  }

  renderSummary(summary) {
    this.lastSummary = summary;
    this.elements.summaryBadge.textContent = summary.badge;
    this.elements.summaryFocusPercent.textContent = `${summary.focusPercent}%`;
    this.elements.summaryFocused.textContent = formatDuration(summary.focusedSeconds);
    this.elements.summaryVanishes.textContent = String(summary.disappearances);
    this.elements.summaryLongest.textContent = formatDuration(summary.longestStreakSeconds);
    this.elements.summaryShame.textContent = String(summary.shameScore);
    this.elements.shareCard.classList.remove("is-revealed");
    requestAnimationFrame(() => {
      this.elements.shareCard.classList.add("is-revealed");
      this.animateSummaryCards();
    });
  }

  animateSummaryCards() {
    if (!window.gsap) return;
    const cards = this.elements.shareCard?.querySelectorAll(".summary-grid article");
    if (!cards?.length) return;
    window.gsap.fromTo(
      cards,
      { opacity: 0, y: 14, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.08, ease: "back.out(1.4)" }
    );
  }

  initStatsSparkles() {
    const container = this.elements.statsSparkles;
    if (!container || container.childElementCount) return;

    container.innerHTML = Array.from({ length: 10 }, (_, index) => {
      const left = 8 + (index * 9) % 84;
      const top = 6 + ((index * 17) % 78);
      const delay = index * 0.45;
      const color = index % 2 ? "#21f4e8" : "#ff5a69";
      return `<span class="stats-sparkle" style="left:${left}%; top:${top}%; background:${color}; animation-delay:${delay}s"></span>`;
    }).join("");
  }

  startAmbientMessages() {
    this.stopAmbientMessages();
    const spawn = () => this.spawnAmbientMessage();
    spawn();
    this.messageTimer = window.setInterval(spawn, 4200);
  }

  stopAmbientMessages() {
    if (this.messageTimer) {
      window.clearInterval(this.messageTimer);
      this.messageTimer = null;
    }
  }

  spawnAmbientMessage() {
    const feed = this.elements.ambientFeed;
    const template = this.elements.ambientMessageTemplate;
    if (!feed || !template) return;

    const node = template.content.firstElementChild.cloneNode(true);
    node.textContent = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    node.style.setProperty("--x", `${Math.floor(Math.random() * 52) + 6}%`);
    node.style.setProperty("--y", `${Math.floor(Math.random() * 62) + 14}%`);
    feed.appendChild(node);
    window.setTimeout(() => node.remove(), 6200);
  }

  async downloadShareCard() {
    const card = this.elements.shareCard;
    if (!card || !this.lastSummary) return;

    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const canvas = document.createElement("canvas");
    const scale = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#17181d");
    gradient.addColorStop(1, "#101114");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    // Part 2.5: polished share card — badge icon, report date, themed layout.
    const badgeIcon = BADGE_ICONS[this.lastSummary.badge] || "⭐";
    const reportDate = new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });

    ctx.fillStyle = "#b6b1a6";
    ctx.font = "800 12px Inter, sans-serif";
    ctx.fillText("TUTOR REPORT", 24, 30);
    ctx.fillStyle = "rgba(182,177,166,0.75)";
    ctx.font = "700 11px Inter, sans-serif";
    ctx.fillText(reportDate, 24, 46);

    ctx.fillStyle = "#ffd166";
    ctx.font = "900 28px Inter, sans-serif";
    const badgeText = `${badgeIcon} ${this.lastSummary.badge}`;
    ctx.fillText(badgeText, width - 24 - ctx.measureText(badgeText).width, 40);

    ctx.fillStyle = "#21f4e8";
    ctx.font = "950 72px Inter, sans-serif";
    const focusText = `${this.lastSummary.focusPercent}%`;
    ctx.fillText(focusText, width / 2 - ctx.measureText(focusText).width / 2, 130);

    ctx.fillStyle = "#b6b1a6";
    ctx.font = "800 14px Inter, sans-serif";
    ctx.fillText("focus score", width / 2 - ctx.measureText("focus score").width / 2, 156);

    const barWidth = Math.min(320, width - 96);
    const barX = width / 2 - barWidth / 2;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(barX, 168, barWidth, 8);
    const barGradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
    barGradient.addColorStop(0, "#21f4e8");
    barGradient.addColorStop(1, "#baff29");
    ctx.fillStyle = barGradient;
    ctx.fillRect(barX, 168, (barWidth * Math.max(0, Math.min(100, this.lastSummary.focusPercent))) / 100, 8);

    const stats = [
      ["present time", formatDuration(this.lastSummary.focusedSeconds)],
      ["vanishes", String(this.lastSummary.disappearances)],
      ["longest streak", formatDuration(this.lastSummary.longestStreakSeconds)],
      ["shame score", String(this.lastSummary.shameScore)]
    ];

    const colWidth = width / 4;
    stats.forEach(([label, value], index) => {
      const x = colWidth * index + colWidth / 2;
      ctx.fillStyle = "#f7f2ea";
      ctx.font = "900 22px Inter, sans-serif";
      ctx.fillText(value, x - ctx.measureText(value).width / 2, 220);
      ctx.fillStyle = "#b6b1a6";
      ctx.font = "700 12px Inter, sans-serif";
      ctx.fillText(label, x - ctx.measureText(label).width / 2, 244);
    });

    ctx.fillStyle = "rgba(186,255,41,0.85)";
    ctx.font = "700 11px Inter, sans-serif";
    const privacy = "Processed locally. Camera never uploaded.";
    ctx.fillText(privacy, width / 2 - ctx.measureText(privacy).width / 2, height - 18);

    const link = document.createElement("a");
    link.download = `tutor-report-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  initHeroParticles() {
    const canvas = this.elements.heroParticles;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      this.particles = Array.from({ length: 28 }, () => this.createParticle(canvas));
    };

    resize();
    window.addEventListener("resize", resize);
    this.startHeroParticles();
  }

  createParticle(canvas) {
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 2.4 + 0.8,
      speedX: (Math.random() - 0.5) * 0.35,
      speedY: (Math.random() - 0.5) * 0.35,
      hue: Math.random() > 0.5 ? "#21f4e8" : "#ff5a69"
    };
  }

  startHeroParticles() {
    if (this.particleFrame || this.screen !== "landing") return;
    const canvas = this.elements.heroParticles;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const draw = () => {
      if (this.screen !== "landing") {
        this.stopHeroParticles();
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const chaos = this.energy > 1;
      this.particles.forEach((particle) => {
        particle.x += particle.speedX * this.energy;
        particle.y += particle.speedY * this.energy;
        if (particle.x < 0 || particle.x > canvas.width) particle.speedX *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.speedY *= -1;

        ctx.beginPath();
        // Chaos mode shifts the palette toward alarm coral/amber.
        ctx.fillStyle = chaos && Math.random() < 0.02 ? "#ffd166" : particle.hue;
        ctx.globalAlpha = chaos ? 0.85 : 0.55;
        ctx.arc(particle.x, particle.y, particle.radius * (chaos ? 1.4 : 1), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      this.particleFrame = window.requestAnimationFrame(draw);
    };

    draw();
  }

  stopHeroParticles() {
    if (this.particleFrame) {
      window.cancelAnimationFrame(this.particleFrame);
      this.particleFrame = null;
    }
  }

  initHeadlineReveal() {
    // Don't split at all for reduced-motion: the plain gradient h1 stays.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const title = document.getElementById("landingTitle");
    if (!title || title.classList.contains("is-split")) return;

    const text = title.textContent;
    title.innerHTML = "";
    title.classList.add("is-split");

    [...text].forEach((char) => {
      const span = document.createElement("span");
      span.className = "title-letter";
      span.textContent = char === " " ? "\u00A0" : char;
      title.appendChild(span);
    });

    const letters = [...title.querySelectorAll(".title-letter")];
    const reveal = () => letters.forEach((el) => el.classList.add("is-in"));
    requestAnimationFrame(() => {
      letters.forEach((el, i) => {
        el.style.transitionDelay = `${i * 45}ms`;
        window.setTimeout(() => el.classList.add("is-in"), 60 + i * 45);
      });
      // Safety net: never leave the headline invisible if timers stall.
      window.setTimeout(reveal, 2000);
    });
  }

  initScrollReveals() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    
    this.revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          this.revealObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: "0px 0px -50px 0px"
    });
    
    document.querySelectorAll(".reveal-on-scroll").forEach((el) => {
      this.revealObserver.observe(el);
    });
  }

  initMagneticButtons() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    
    const magneticButtons = document.querySelectorAll(".primary-button[data-magnetic], #startSetupButton");
    magneticButtons.forEach((btn) => {
      const handleMove = (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        const distance = Math.sqrt(x * x + y * y);
        const maxDistance = 100;
        
        if (distance < maxDistance) {
          const force = 1 - distance / maxDistance;
          const moveX = x * force * 0.3;
          const moveY = y * force * 0.3;
          btn.style.transform = `translate(${moveX}px, ${moveY}px) scale(1.02)`;
          btn.classList.add("is-magnetic");
        }
      };
      
      const handleLeave = () => {
        btn.style.transform = "";
        btn.classList.remove("is-magnetic");
      };
      
      btn.addEventListener("pointermove", handleMove);
      btn.addEventListener("pointerleave", handleLeave);
      this.magneticButtons.set(btn, { handleMove, handleLeave });
    });
  }

  initCardTilt() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    
    const tiltCards = document.querySelectorAll(".quick-stats article, .stats-summary article, .summary-grid article");
    tiltCards.forEach((card) => {
      const handleMove = (e) => {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        const rotateX = y * -8;
        const rotateY = x * 8;
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px) rotate(-0.4deg)`;
        card.classList.add("is-tilting");
      };
      
      const handleLeave = () => {
        card.style.transform = "";
        card.classList.remove("is-tilting");
      };
      
      card.addEventListener("pointermove", handleMove);
      card.addEventListener("pointerleave", handleLeave);
      this.tiltCards.set(card, { handleMove, handleLeave });
    });
  }

  initMascotReactions() {
    const mascot = document.getElementById("mascotImage");
    const stage = this.elements.mascotStage;
    if (!mascot || !stage) return;
    
    let reactionTimeout = null;
    
    stage.addEventListener("pointerenter", () => {
      if (reactionTimeout) clearTimeout(reactionTimeout);
      mascot.classList.add("is-reacting");
      this.elements.mascotBubble.textContent = "Hello there! 👋";
      reactionTimeout = setTimeout(() => {
        mascot.classList.remove("is-reacting");
        this.elements.mascotBubble.textContent = "I am watching the chair.";
      }, 1200);
    });
    
    stage.addEventListener("pointerleave", () => {
      if (reactionTimeout) clearTimeout(reactionTimeout);
      mascot.classList.remove("is-reacting");
      this.elements.mascotBubble.textContent = "I am watching the chair.";
    });
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            mascot.classList.add("is-reacting");
            this.elements.mascotBubble.textContent = "Ready when you are!";
            setTimeout(() => {
              mascot.classList.remove("is-reacting");
              this.elements.mascotBubble.textContent = "I am watching the chair.";
            }, 1200);
          }, 600);
        }
      });
    }, { threshold: 0.5 });
    
    observer.observe(stage);
  }

  animateLandingCards() {
    if (!window.gsap || this.screen !== "landing") return;
    const cards = document.querySelectorAll("#quickStats article");
    if (!cards.length) return;
    window.gsap.fromTo(
      cards,
      { opacity: 0, y: 18, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.08, ease: "back.out(1.4)" }
    );
    
    const heroElements = document.querySelectorAll("#landingScreen .hero-copy > *:not(.hero-floaters)");
    heroElements.forEach((el, i) => {
      el.classList.add("reveal-on-scroll");
      el.classList.add(`stagger-${Math.min(i + 1, 6)}`);
    });
    
    if (this.revealObserver) {
      heroElements.forEach((el) => this.revealObserver.observe(el));
    }
  }

  animateStatsPanel() {
    if (!window.gsap) return;
    const cards = this.elements.statsSummary?.querySelectorAll("article");
    const rows = this.elements.historyList?.querySelectorAll(".history-row");
    
    if (cards?.length) {
      cards.forEach((card) => {
        card.classList.add("stat-card-entrance");
        const numberEl = card.querySelector("span:not(.stat-icon)");
        if (numberEl) {
          numberEl.classList.add("stat-number-counting");
          this.animateCountUp(numberEl);
        }
        const icon = card.querySelector(".stat-icon");
        if (icon) {
          icon.addEventListener("pointerenter", () => icon.classList.add("icon-bounce"));
          icon.addEventListener("animationend", () => icon.classList.remove("icon-bounce"));
        }
        
        const tooltip = this.createStatTooltip(card);
        if (tooltip) {
          card.appendChild(tooltip);
          card.addEventListener("pointerenter", () => tooltip.classList.add("show"));
          card.addEventListener("pointerleave", () => tooltip.classList.remove("show"));
        }
      });
      
      window.gsap.fromTo(
        cards,
        { opacity: 0, y: 16, rotate: -1 },
        { opacity: 1, y: 0, rotate: 0, duration: 0.42, stagger: 0.07, ease: "back.out(1.5)" }
      );
    }
    
    if (rows?.length) {
      window.gsap.fromTo(
        rows,
        { opacity: 0, x: -16 },
        { opacity: 1, x: 0, duration: 0.38, stagger: 0.06, ease: "power2.out" }
      );
    }
    
    this.animateProgressRing();
  }

  animateCountUp(element) {
    // Fix (bugs #3/#5 + #4): the old code did
    //   element.textContent = text.replace(match[1], displayValue)
    // where displayValue already contained "%"/"m". Replacing only the
    // digits left the original suffix in place, producing "31%%" and
    // "5h 0mh 0m"-style doubles. We now ASSIGN the full formatted value.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const text = element.textContent.trim();
    const match = text.match(/^(\d+(?:,\d{3})*(?:\.\d+)?)/);
    if (!match) return;

    const targetNum = parseFloat(match[1].replace(/,/g, ""));
    const hasPercent = text.includes("%");
    const hasHours = text.includes("h");
    const hasMinutes = text.includes("m") && !hasPercent;

    let targetValue = targetNum;
    const isDuration = hasHours || hasMinutes;
    if (isDuration) {
      const parts = text.match(/(\d+)\s*h(?:\s*(\d+)\s*m)?/) || text.match(/(\d+)\s*m/);
      if (parts && hasHours) {
        targetValue = Number(parts[1] || 0) * 60 + Number(parts[2] || 0);
      } else {
        targetValue = targetNum;
      }
    }

    const duration = 1000;
    const startTime = performance.now();

    const update = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = targetValue * eased;

      if (hasPercent) {
        element.textContent = `${Math.round(current)}%`;
      } else if (isDuration) {
        const totalMinutes = Math.round(current);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        element.textContent = hours > 0
          ? `${hours}h ${String(minutes).padStart(2, "0")}m`
          : `${minutes}m`;
      } else {
        element.textContent = Math.round(current).toLocaleString();
      }

      if (progress < 1) requestAnimationFrame(update);
      else element.textContent = text; // land exactly on the real value
    };

    requestAnimationFrame(update);
  }

  formatDurationShort(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
    return `${minutes}m`;
  }

  createStatTooltip(card) {
    const label = card.querySelector("small");
    if (!label) return null;
    
    const tooltip = document.createElement("div");
    tooltip.className = "stat-tooltip";
    tooltip.style.cssText = `
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%) translateY(8px);
      padding: 0.5rem 0.75rem;
      border-radius: var(--radius);
      background: var(--panel-strong);
      border: 1px solid var(--line);
      font-size: 0.75rem;
      color: var(--muted);
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 200ms ease, transform 200ms ease;
      z-index: 10;
      box-shadow: var(--shadow);
    `;
    
    const statType = label.textContent.trim();
    let detail = "";
    
    if (statType.includes("session")) {
      detail = "Click to start your first focus session";
    } else if (statType.includes("focus")) {
      detail = "Average focus across all sessions";
    } else if (statType.includes("present")) {
      detail = "Total time you've stayed in frame";
    } else if (statType.includes("streak") || statType.includes("day")) {
      detail = "Consecutive days with a completed session";
    }
    
    tooltip.textContent = detail || "Keep focusing to unlock insights";
    return tooltip;
  }

  animateProgressRing() {
    const summary = this.lastSummary;
    if (!summary) return;
    
    const ring = this.elements.statsSummary?.querySelector(".progress-ring-animated");
    if (ring) return;
    
    const focusCard = this.elements.statsSummary?.querySelector("article:nth-child(2)");
    if (!focusCard) return;
    
    const percent = summary.averageFocusPercent || 0;
    const circumference = 2 * Math.PI * 40;
    const offset = circumference * (1 - percent / 100);
    
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("progress-ring-animated");
    svg.style.cssText = `
      width: 64px;
      height: 64px;
      transform: rotate(-90deg);
      margin: 0.5rem auto 0;
    `;
    svg.innerHTML = `
      <circle
        cx="40" cy="40" r="40"
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        stroke-width="6"
      />
      <circle
        cx="40" cy="40" r="40"
        fill="none"
        stroke="var(--cyan)"
        stroke-width="6"
        stroke-linecap="round"
        stroke-dasharray="${circumference}"
        stroke-dashoffset="${circumference}"
        style="--ring-circumference: ${circumference}; --ring-offset: ${offset};"
      />
    `;
    
    focusCard.appendChild(svg);
    requestAnimationFrame(() => {
      svg.classList.add("progress-ring-animated");
    });
  }

  renderStats(history) {
    const aggregate = getAggregateStats(history);
    const summaryValues = [
      aggregate.sessions,
      `${aggregate.averageFocusPercent}%`,
      formatDuration(aggregate.totalFocusedSeconds),
      getDailyStreakDisplay()
    ];
    const summaryLabels = ["sessions", "avg focus", "present total", "day streak"];

    this.elements.statsSummary.innerHTML = summaryValues
      .map(
        (value, index) => `
          <article class="stat-card-entrance">
            <span class="stat-icon" aria-hidden="true">${STAT_ICONS[index]}</span>
            <span>${value}</span>
            <small>${summaryLabels[index]}</small>
          </article>
        `
      )
      .join("");

    if (!history.length) {
      this.elements.historyList.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon zero-state" aria-hidden="true">🕵️</span>
          <strong>No sessions yet</strong>
          <span>Tutor is ready when you are. Start one and this trail gets colorful.</span>
        </div>
      `;
      this.renderHeatmap(history);
      this.renderFocusChart(history);
      this.renderBadgeGallery(history);
      this.animateStatsPanel();
      return;
    }

    this.elements.historyList.innerHTML = history
      .slice(0, 12)
      .map((item, index) => {
        const date = new Date(item.endedAt || item.startedAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric"
        });
        const icon = BADGE_ICONS[item.badge] || "⭐";
        const accent = item.focusPercent >= 90 ? "#21f4e8" : item.focusPercent >= 75 ? "#ffd166" : "#ff5a69";
        return `
          <article class="history-row" style="--row-accent: ${accent}">
            <div class="history-meta">
              <strong>${date}</strong>
              <span class="history-badge">${icon} ${item.badge}</span>
            </div>
            <span class="history-chip">${item.focusPercent}% focus</span>
            <span class="history-chip">${item.disappearances} vanishes</span>
            <div class="history-bar" aria-label="${item.focusPercent}% focus">
              <span style="--bar: ${item.focusPercent}%; --bar-delay: ${index * 90}ms"></span>
            </div>
          </article>
        `;
      })
      .join("");

    this.renderHeatmap(history);
    this.renderFocusChart(history);
    this.renderBadgeGallery(history);
    this.animateStatsPanel();
  }

  // Part 2.1: GitHub-style daily activity heatmap over the last 8 weeks.
  renderHeatmap(history) {
    const grid = this.elements.heatmapGrid;
    if (!grid) return;
    const days = getDailyActivity(history, 56);
    const maxFocused = Math.max(0, ...days.map((d) => d.focusedSeconds));
    grid.innerHTML = days
      .map((day) => {
        let level = 0;
        if (day.focusedSeconds > 0) {
          const ratio = maxFocused ? day.focusedSeconds / maxFocused : 0;
          level = ratio >= 0.75 ? 4 : ratio >= 0.45 ? 3 : ratio >= 0.2 ? 2 : 1;
        }
        const label = day.date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        const detail = `${label}: ${day.sessions} session${day.sessions === 1 ? "" : "s"}, ${formatDuration(day.focusedSeconds)} present`;
        return `<span class="heatmap-cell" data-level="${level}" title="${detail}"></span>`;
      })
      .join("");
  }

  // Part 2.2: bar chart of focus % per session (oldest → newest).
  renderFocusChart(history) {
    const chart = this.elements.focusChart;
    if (!chart) return;
    const sessions = history.slice(0, 12).reverse();
    if (!sessions.length) {
      chart.innerHTML = `<div class="focus-chart-empty">No sessions yet — your chart grows here.</div>`;
      return;
    }
    chart.innerHTML = sessions
      .map((item) => {
        const pct = Math.max(0, Math.min(100, Number(item.focusPercent || 0)));
        const tone = pct >= 90 ? "high" : pct >= 75 ? "mid" : "low";
        const date = new Date(item.endedAt || item.startedAt).toLocaleDateString(undefined, {
          month: "numeric",
          day: "numeric"
        });
        return `
          <div class="focus-chart-bar" data-tone="${tone}" title="${date}: ${pct}% focus, ${item.disappearances} vanishes">
            <i style="height:${Math.max(4, pct)}%"></i>
            <small>${pct}%</small>
          </div>
        `;
      })
      .join("");
  }

  // Part 2.3: badge gallery — earned in color, locked greyed out, with a
  // pop animation the first time a new badge appears in history.
  renderBadgeGallery(history) {
    const grid = this.elements.badgeGrid;
    if (!grid) return;
    const earned = new Set(getEarnedBadges(history));
    const previouslyUnlocked = new Set(loadUnlockedBadges());
    const newlyUnlocked = [...earned].filter((b) => !previouslyUnlocked.has(b));
    if (earned.size) saveUnlockedBadges([...previouslyUnlocked, ...earned]);

    grid.innerHTML = ALL_BADGES.map((badge) => {
      const isEarned = earned.has(badge.name);
      const isNew = newlyUnlocked.includes(badge.name);
      return `
        <div class="badge-cell ${isEarned ? "is-earned" : "is-locked"}${isNew ? " just-unlocked" : ""}"
             title="${isEarned ? "Unlocked" : "Locked"}: ${badge.hint}">
          <span class="badge-icon" aria-hidden="true">${isEarned ? badge.icon : "🔒"}</span>
          <strong>${badge.name}</strong>
          <small>${badge.hint}</small>
        </div>
      `;
    }).join("");

    if (this.elements.badgeCount) {
      this.elements.badgeCount.textContent = `${earned.size}/${ALL_BADGES.length} unlocked`;
    }
    if (newlyUnlocked.length && window.confetti && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.confetti({ particleCount: 60, spread: 60, origin: { y: 0.7 }, colors: ["#ffd166", "#21f4e8", "#ff5a69"] });
    }
  }

  // Part 2.6 / 3: hint text + preview playing state + custom clip list.
  updateSoundPackHint(pack) {
    if (this.elements.soundPackHint) {
      this.elements.soundPackHint.textContent = PACK_HINTS[pack] || PACK_HINTS.alarm;
    }
    if (this.elements.customSoundsField) {
      this.elements.customSoundsField.hidden = pack !== "custom";
    }
  }

  setPreviewPlaying(playing) {
    this.elements.soundPreviewButton?.classList.toggle("is-playing", Boolean(playing));
  }

  renderCustomSounds(clips = []) {
    const list = this.elements.customSoundList;
    if (!list) return;
    list.innerHTML = clips.length
      ? clips.map((clip) => `
          <li>
            <span>${escapeHtml(clip.name || "custom clip")}</span>
            <button type="button" data-delete-sound="${clip.id}">Remove</button>
          </li>
        `).join("")
      : `<li><span>No custom clips yet — upload one above.</span></li>`;
  }

  bindCursor() {
    const cursor = this.elements.cursorDot;
    if (!cursor) return;
    
    window.addEventListener("pointermove", (event) => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
    });
    
    const interactiveElements = "button, a, input, select, .quick-stats article, .stats-summary article, .summary-grid article, .history-row, .mascot-stage, .icon-button, .primary-button, .secondary-button, .brand-button";
    document.addEventListener("pointerover", (e) => {
      if (e.target.closest(interactiveElements)) {
        cursor.classList.add("is-hovering");
      }
    });
    document.addEventListener("pointerout", (e) => {
      if (e.target.closest(interactiveElements)) {
        cursor.classList.remove("is-hovering");
      }
    });
    document.addEventListener("pointerdown", () => cursor.classList.add("is-clicking"));
    document.addEventListener("pointerup", () => cursor.classList.remove("is-clicking"));
  }
}
