export class TimerEngine extends EventTarget {
  constructor() {
    super();
    this.intervalId = null;
    this.status = "idle";
    this.phase = "focus";
    this.startedAt = null;
    this.lastTickAt = null;
    this.elapsedFocusSeconds = 0;
    this.breakElapsedSeconds = 0;
    this.durationSeconds = 25 * 60;
    this.breakIntervalSeconds = 0;
    this.breakLengthSeconds = 5 * 60;
    this.nextBreakAt = Infinity;
  }

  configure(settings) {
    this.durationSeconds = Math.round(Number(settings.durationMinutes || 25) * 60);
    this.breakIntervalSeconds = Math.round(Number(settings.breakIntervalMinutes || 0) * 60);
    this.breakLengthSeconds = Math.round(Number(settings.breakLengthMinutes || 5) * 60);
    this.nextBreakAt = this.breakIntervalSeconds > 0 ? this.breakIntervalSeconds : Infinity;
  }

  start(settings) {
    this.stopInterval();
    this.configure(settings);
    this.status = "running";
    this.phase = "focus";
    this.startedAt = new Date().toISOString();
    this.lastTickAt = performance.now();
    this.elapsedFocusSeconds = 0;
    this.breakElapsedSeconds = 0;
    this.nextBreakAt = this.breakIntervalSeconds > 0 ? this.breakIntervalSeconds : Infinity;
    this.intervalId = window.setInterval(() => this.tick(), 250);
    this.emit("start", this.snapshot(0));
    this.emit("tick", this.snapshot(0));
  }

  pause() {
    if (this.status !== "running") return;
    this.status = "paused";
    this.emit("pause", this.snapshot(0));
  }

  resume() {
    if (this.status !== "paused") return;
    this.status = "running";
    this.lastTickAt = performance.now();
    this.emit("resume", this.snapshot(0));
  }

  end(completed = false) {
    if (this.status === "idle" || this.status === "ended") return;
    this.status = "ended";
    this.stopInterval();
    this.emit("end", { ...this.snapshot(0), completed });
  }

  tick() {
    const now = performance.now();
    const deltaSeconds = this.status === "running" ? Math.max(0, (now - this.lastTickAt) / 1000) : 0;
    this.lastTickAt = now;

    if (this.status !== "running") {
      this.emit("tick", this.snapshot(0));
      return;
    }

    if (this.phase === "break") {
      this.breakElapsedSeconds += deltaSeconds;
      if (this.breakElapsedSeconds >= this.breakLengthSeconds) {
        this.phase = "focus";
        this.breakElapsedSeconds = 0;
        this.nextBreakAt += this.breakIntervalSeconds;
        this.emit("phasechange", this.snapshot(deltaSeconds));
      }
    } else {
      this.elapsedFocusSeconds = Math.min(this.durationSeconds, this.elapsedFocusSeconds + deltaSeconds);

      if (this.elapsedFocusSeconds >= this.durationSeconds) {
        this.emit("tick", this.snapshot(deltaSeconds));
        this.end(true);
        return;
      }

      const enoughTimeRemains = this.durationSeconds - this.elapsedFocusSeconds > 45;
      if (this.breakIntervalSeconds > 0 && this.elapsedFocusSeconds >= this.nextBreakAt && enoughTimeRemains) {
        this.phase = "break";
        this.breakElapsedSeconds = 0;
        this.emit("phasechange", this.snapshot(deltaSeconds));
      }
    }

    this.emit("tick", this.snapshot(deltaSeconds));
  }

  snapshot(deltaSeconds = 0) {
    const focusRemainingSeconds = Math.max(0, this.durationSeconds - this.elapsedFocusSeconds);
    const breakRemainingSeconds = Math.max(0, this.breakLengthSeconds - this.breakElapsedSeconds);
    const activeTotal = this.phase === "break" ? this.breakLengthSeconds : this.durationSeconds;
    const activeRemaining = this.phase === "break" ? breakRemainingSeconds : focusRemainingSeconds;
    const activeElapsed = Math.max(0, activeTotal - activeRemaining);

    return {
      status: this.status,
      phase: this.phase,
      startedAt: this.startedAt,
      deltaSeconds,
      durationSeconds: this.durationSeconds,
      elapsedFocusSeconds: this.elapsedFocusSeconds,
      focusRemainingSeconds,
      breakLengthSeconds: this.breakLengthSeconds,
      breakRemainingSeconds,
      activeTotalSeconds: activeTotal,
      activeRemainingSeconds: activeRemaining,
      progress: activeTotal > 0 ? Math.min(1, activeElapsed / activeTotal) : 0
    };
  }

  stopInterval() {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
