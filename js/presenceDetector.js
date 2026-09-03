export const PRESENCE_STATES = {
  PRESENT: "PRESENT",
  AWAY_GRACE: "AWAY_GRACE",
  AWAY_PUNISHED: "AWAY_PUNISHED"
};

const MODEL_URIS = [
  "https://cdn.jsdelivr.net/gh/cgarciagl/face-api.js@0.22.2/weights",
  "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"
];

export class PresenceDetector extends EventTarget {
  constructor(videoElements, config = {}) {
    super();
    this.videoElements = Array.isArray(videoElements) ? videoElements : [videoElements];
    this.config = {
      graceSeconds: 7,
      intervalMs: 700,
      ...config
    };
    this.stream = null;
    this.loopId = null;
    this.modelReady = false;
    this.modelError = null;
    this.mode = "idle";
    this.monitoring = false;
    this.state = PRESENCE_STATES.PRESENT;
    this.lastPresentAt = Date.now();
    this.lastState = PRESENCE_STATES.PRESENT;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 120;
    this.canvas.height = 90;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    this.previousFrame = null;
    this.motionPresentUntil = 0;
  }

  async start() {
    if (this.stream) return { mode: this.mode, stream: this.stream };

    if (!navigator.mediaDevices?.getUserMedia) {
      this.mode = "unavailable";
      this.emitStatus("Camera API is unavailable in this browser.");
      throw new Error("Camera API unavailable");
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 420 },
        facingMode: "user"
      },
      audio: false
    });

    for (const video of this.videoElements) {
      video.srcObject = this.stream;
      await video.play().catch(() => undefined);
      video.closest(".camera-frame")?.classList.add("has-video");
    }

    await this.tryLoadFaceModel();
    this.lastPresentAt = Date.now();
    this.state = PRESENCE_STATES.PRESENT;
    this.startLoop();
    return { mode: this.mode, stream: this.stream };
  }

  setMonitoring(enabled) {
    this.monitoring = Boolean(enabled);
    if (!this.monitoring) {
      this.lastPresentAt = Date.now();
      this.setState(PRESENCE_STATES.PRESENT, {
        present: true,
        confidence: 1,
        awaySeconds: 0,
        mode: this.mode
      });
    }
  }

  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }

  async tryLoadFaceModel() {
    if (!window.faceapi?.nets?.tinyFaceDetector) {
      this.mode = "motion";
      this.modelError = "face-api.js did not load";
      this.emitStatus("Face model unavailable. Motion fallback active.");
      return;
    }

    for (const uri of MODEL_URIS) {
      try {
        await window.faceapi.nets.tinyFaceDetector.loadFromUri(uri);
        this.modelReady = true;
        this.mode = "face";
        this.emitStatus("Face detector active.");
        return;
      } catch (error) {
        this.modelError = error;
      }
    }

    this.mode = "motion";
    this.emitStatus("Face model failed. Motion fallback active.");
  }

  startLoop() {
    this.stopLoop();
    const run = async () => {
      await this.sample().catch((error) => {
        this.modelError = error;
        this.modelReady = false;
        this.mode = "motion";
      });
      this.loopId = window.setTimeout(run, this.config.intervalMs);
    };
    run();
  }

  stopLoop() {
    if (this.loopId) {
      window.clearTimeout(this.loopId);
      this.loopId = null;
    }
  }

  async sample() {
    const video = this.videoElements[0];
    if (!video || video.readyState < 2) return;

    let present = false;
    let confidence = 0;
    let mode = this.mode;

    if (this.modelReady && window.faceapi) {
      const options = new window.faceapi.TinyFaceDetectorOptions({
        inputSize: 160,
        scoreThreshold: 0.45
      });
      const result = await window.faceapi.detectSingleFace(video, options);
      present = Boolean(result);
      confidence = result?.score || 0;
      mode = "face";
    } else {
      const motion = this.detectMotion(video);
      present = motion.present;
      confidence = motion.confidence;
      mode = "motion";
    }

    if (!this.monitoring) {
      present = true;
      confidence = 1;
    }

    const detail = this.evaluatePresence(present, confidence, mode);
    this.dispatchEvent(new CustomEvent("sample", { detail }));
  }

  detectMotion(video) {
    this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
    const frame = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

    if (!this.previousFrame) {
      this.previousFrame = frame;
      this.motionPresentUntil = Date.now() + this.config.graceSeconds * 1000;
      return { present: true, confidence: 0.4 };
    }

    let changed = 0;
    const data = frame.data;
    const previous = this.previousFrame.data;

    for (let index = 0; index < data.length; index += 16) {
      const diff =
        Math.abs(data[index] - previous[index]) +
        Math.abs(data[index + 1] - previous[index + 1]) +
        Math.abs(data[index + 2] - previous[index + 2]);
      if (diff > 36) changed += 1;
    }

    this.previousFrame = frame;
    const samples = data.length / 16;
    const ratio = changed / samples;

    if (ratio > 0.024) {
      this.motionPresentUntil = Date.now() + Math.max(2600, this.config.graceSeconds * 550);
    }

    return {
      present: Date.now() < this.motionPresentUntil,
      confidence: Math.min(1, ratio * 12)
    };
  }

  evaluatePresence(present, confidence, mode) {
    const now = Date.now();
    if (present) this.lastPresentAt = now;

    const awaySeconds = Math.max(0, (now - this.lastPresentAt) / 1000);
    const nextState = present
      ? PRESENCE_STATES.PRESENT
      : awaySeconds >= this.config.graceSeconds
        ? PRESENCE_STATES.AWAY_PUNISHED
        : PRESENCE_STATES.AWAY_GRACE;

    return this.setState(nextState, {
      present,
      confidence,
      awaySeconds,
      mode
    });
  }

  setState(nextState, detail) {
    const previousState = this.state;
    this.lastState = previousState;
    this.state = nextState;
    const payload = {
      ...detail,
      state: nextState,
      previousState,
      changed: previousState !== nextState
    };

    if (payload.changed) {
      this.dispatchEvent(new CustomEvent("statechange", { detail: payload }));
    }

    return payload;
  }

  emitStatus(message) {
    this.dispatchEvent(new CustomEvent("status", { detail: { message, mode: this.mode } }));
  }
}
