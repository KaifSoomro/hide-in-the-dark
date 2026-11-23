/* =============================================================================
 * HIDE IN THE DARK - procedural audio (Web Audio API, no audio files needed)
 * Every effect is synthesised from oscillators and filtered noise.
 * The AudioContext is created lazily on the first user gesture (browser autoplay rules).
 * ========================================================================== */
(function (root) {
  'use strict';

  class SFX {
    constructor() {
      this.ctx = null; this.master = null; this.muted = false;      // muted == sound effects off
      this.musicOn = true; this.sfxVol = 0.8; this.musicVol = 0.5;
      this.musicBus = null; this.musicTimer = null; this.chordIdx = 0;
      this.noiseBuf = null; this.ambientNodes = null; this.ambientTimer = 0;
      this.last = {};                                  // per-effect throttle timestamps
    }

    /** Create / resume the context. Safe to call many times. Must be called from a user gesture first. */
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();     // keeps stacked effects from clipping
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();                  // sound-effects bus (every effect connects here)
      this.master.gain.value = this.muted ? 0 : this.sfxVol;
      this.master.connect(comp);
      this.musicBus = this.ctx.createGain();                // music bus (separate volume + toggle)
      this.musicBus.gain.value = this.musicOn ? this.musicVol : 0;
      this.musicBus.connect(comp);
      // simple echo for the music bells
      this.echo = this.ctx.createDelay(1.0); this.echo.delayTime.value = 0.46;
      const fb = this.ctx.createGain(); fb.gain.value = 0.38;
      this.echo.connect(fb); fb.connect(this.echo); this.echo.connect(this.musicBus);
      // one second of white noise reused by every noise based effect
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }

    /** sound effects on/off */
    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.sfxVol, this.ctx.currentTime, 0.03);
    }
    toggleMute() { this.setMuted(!this.muted); return this.muted; }
    setSfxVolume(v) { this.sfxVol = v; if (this.master && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03); }
    /** music on/off + volume */
    setMusicOn(on) {
      this.musicOn = on;
      if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? this.musicVol : 0, this.ctx.currentTime, 0.2);
      if (on) this.startMusic(); else this.stopMusic();
    }
    setMusicVolume(v) { this.musicVol = v; if (this.musicBus && this.musicOn) this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

    /* ---- procedural horror music: slow minor pads + sparse echoing bells ---- */
    startMusic() {
      if (!this.ctx || !this.musicOn || this.musicTimer) return;
      this.musicNext = this.ctx.currentTime + 0.1; this.bellNext = this.ctx.currentTime + 1.5;
      this._musicSchedule();
      this.musicTimer = setInterval(() => this._musicSchedule(), 500);
    }
    stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } }
    _musicSchedule() {
      const c = this.ctx; if (!c || !this.musicOn) return;
      const CHORDS = [[110, 130.81, 164.81], [87.31, 130.81, 174.61], [98, 146.83, 196], [82.41, 123.47, 164.81, 207.65]];
      const BELLS = [440, 523.25, 587.33, 659.25, 783.99, 880];
      while (this.musicNext < c.currentTime + 2) {
        const t = this.musicNext, ch = CHORDS[this.chordIdx++ % CHORDS.length];
        ch.forEach((f, i) => {
          const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
          o.type = i === 0 ? 'sawtooth' : 'triangle'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 12;
          lp.type = 'lowpass'; lp.frequency.value = 420;
          g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(i === 0 ? 0.035 : 0.05, t + 2.4); g.gain.linearRampToValueAtTime(0.0001, t + 6.4);
          o.connect(lp); lp.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 6.5);
        });
        const sub = c.createOscillator(), sg = c.createGain();
        sub.type = 'sine'; sub.frequency.value = ch[0] / 2;
        sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(0.09, t + 2); sg.gain.linearRampToValueAtTime(0.0001, t + 6.4);
        sub.connect(sg); sg.connect(this.musicBus); sub.start(t); sub.stop(t + 6.5);
        this.musicNext += 6;
      }
      while (this.bellNext < c.currentTime + 2) {
        const t = this.bellNext, f = BELLS[(Math.random() * BELLS.length) | 0] * (Math.random() < 0.3 ? 0.5 : 1);
        const o = c.createOscillator(), g = c.createGain(), send = c.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
        send.gain.value = 0.7;
        o.connect(g); g.connect(this.musicBus); g.connect(send); send.connect(this.echo); o.start(t); o.stop(t + 3.1);
        this.bellNext += 1.8 + Math.random() * 3.6;
      }
    }

    /* ---- building blocks ---- */
    _ok(name, minGap) {
      if (!this.ctx || this.muted) return false;
      const t = this.ctx.currentTime;
      if (this.last[name] && t - this.last[name] < minGap) return false;
      this.last[name] = t; return true;
    }
    tone({ f = 440, f2 = null, dur = 0.2, type = 'sine', gain = 0.2, delay = 0, attack = 0.005, vibrato = 0, dest = null }) {
      const c = this.ctx, t = c.currentTime + delay;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
      if (vibrato) {
        const lfo = c.createOscillator(), lg = c.createGain();
        lfo.frequency.value = vibrato; lg.gain.value = f * 0.03; lfo.connect(lg); lg.connect(o.frequency);
        lfo.start(t); lfo.stop(t + dur + 0.05);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.master);
      o.start(t); o.stop(t + dur + 0.05);
    }
    noise({ dur = 0.15, freq = 1000, freq2 = null, q = 1, type = 'bandpass', gain = 0.2, delay = 0, attack = 0.003, dest = null }) {
      const c = this.ctx, t = c.currentTime + delay;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
      if (freq2) f.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || this.master);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    }

    /* ---- effects ---- */
    footstep(run) {
      if (!this._ok(run ? 'run' : 'walk', run ? 0.12 : 0.2)) return;
      const v = 0.6 + Math.random() * 0.4;
      this.noise({ dur: run ? 0.09 : 0.07, freq: run ? 520 : 380, freq2: 160, q: 1.4, gain: (run ? 0.20 : 0.10) * v });
      this.tone({ f: run ? 110 : 85, f2: 55, dur: 0.07, type: 'sine', gain: run ? 0.13 : 0.07 });
    }
    glass() {
      if (!this._ok('glass', 0.1)) return;
      this.noise({ dur: 0.5, freq: 6500, freq2: 3000, q: 0.7, type: 'highpass', gain: 0.35 });
      for (let i = 0; i < 9; i++) this.tone({ f: 2200 + Math.random() * 3800, dur: 0.12, type: 'triangle', gain: 0.07, delay: i * 0.035 + Math.random() * 0.03 });
    }
    metal() {
      if (!this._ok('metal', 0.1)) return;
      [523, 811, 1337, 2113].forEach((f, i) => this.tone({ f: f * (0.97 + Math.random() * 0.06), dur: 0.7 - i * 0.1, type: 'square', gain: 0.07 / (i + 1) + 0.02 }));
      this.noise({ dur: 0.08, freq: 3000, q: 2, gain: 0.2 });
    }
    wood() {
      if (!this._ok('wood', 0.2)) return;
      this.tone({ f: 190, f2: 120, dur: 0.22, type: 'sawtooth', gain: 0.08, vibrato: 18 });
      this.noise({ dur: 0.18, freq: 700, freq2: 300, q: 4, gain: 0.12 });
    }
    door(slam) {
      if (!this._ok('door', 0.25)) return;
      if (slam) {
        this.noise({ dur: 0.35, freq: 220, freq2: 60, q: 0.8, type: 'lowpass', gain: 0.6 });
        this.tone({ f: 90, f2: 35, dur: 0.4, type: 'sine', gain: 0.5 });
        this.noise({ dur: 0.1, freq: 1800, q: 1, gain: 0.25 });
      } else {
        this.tone({ f: 240, f2: 420, dur: 0.45, type: 'sawtooth', gain: 0.07, vibrato: 9 });
        this.noise({ dur: 0.4, freq: 500, freq2: 900, q: 6, gain: 0.05 });
      }
    }
    whistle() {
      if (!this._ok('whistle', 0.3)) return;
      this.tone({ f: 2350, f2: 2750, dur: 0.55, type: 'sine', gain: 0.25, attack: 0.04, vibrato: 32 });
      this.tone({ f: 2420, f2: 2800, dur: 0.55, type: 'sine', gain: 0.1, attack: 0.04, vibrato: 29 });
      this.noise({ dur: 0.5, freq: 4200, q: 3, gain: 0.04 });
    }
    alert() {
      if (!this._ok('alert', 0.4)) return;
      this.tone({ f: 740, dur: 0.12, type: 'square', gain: 0.16 });
      this.tone({ f: 988, dur: 0.22, type: 'square', gain: 0.16, delay: 0.11 });
      this.tone({ f: 82, f2: 60, dur: 0.5, type: 'sawtooth', gain: 0.18 });
    }
    suspicious() {
      if (!this._ok('susp', 1.2)) return;
      this.tone({ f: 330, f2: 392, dur: 0.25, type: 'triangle', gain: 0.09 });
    }
    pickup() {
      if (!this._ok('pickup', 0.1)) return;
      [988, 1319, 1568, 1976].forEach((f, i) => this.tone({ f, dur: 0.25, type: 'triangle', gain: 0.13, delay: i * 0.07 }));
      this.noise({ dur: 0.25, freq: 7000, type: 'highpass', gain: 0.05, delay: 0.05 });
    }
    hide(on) {
      if (!this._ok('hide', 0.2)) return;
      this.noise({ dur: 0.25, freq: on ? 500 : 700, freq2: on ? 200 : 1200, q: 0.8, type: 'lowpass', gain: 0.18 });
      this.tone({ f: on ? 140 : 180, f2: on ? 100 : 230, dur: 0.15, type: 'sine', gain: 0.08 });
    }
    deny() { if (this._ok('deny', 0.25)) this.tone({ f: 160, f2: 120, dur: 0.15, type: 'square', gain: 0.07 }); }
    capture() {
      if (!this.ctx || this.muted) return;
      this.noise({ dur: 0.25, freq: 300, q: 0.7, type: 'lowpass', gain: 0.4 });
      [392, 330, 262, 196, 131].forEach((f, i) => this.tone({ f, dur: 0.4, type: 'sawtooth', gain: 0.15, delay: 0.12 + i * 0.16 }));
    }
    victory() {
      if (!this.ctx || this.muted) return;
      [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone({ f, dur: 0.32, type: 'triangle', gain: 0.17, delay: i * 0.12 }));
      this.tone({ f: 262, dur: 1.2, type: 'sine', gain: 0.12, delay: 0.3 });
    }
    exitOpen() {
      if (!this._ok('exitOpen', 1)) return;
      [392, 523, 659].forEach((f, i) => this.tone({ f, dur: 0.5, type: 'sine', gain: 0.12, delay: i * 0.15 }));
    }
    click() { if (this._ok('click', 0.05)) this.tone({ f: 600, f2: 420, dur: 0.06, type: 'square', gain: 0.05 }); }

    /* ---- ambience: low drone + occasional creaks / wind ---- */
    startAmbient() {
      if (!this.ctx || this.ambientNodes) return;
      const c = this.ctx;
      const g = c.createGain(); g.gain.value = 0.0; g.gain.setTargetAtTime(0.10, c.currentTime, 1.5); g.connect(this.master);
      const o1 = c.createOscillator(), o2 = c.createOscillator();
      o1.type = 'sine'; o2.type = 'sine'; o1.frequency.value = 55; o2.frequency.value = 55.7;
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 0.04; lfo.connect(lg); lg.connect(g.gain);
      o1.connect(g); o2.connect(g); o1.start(); o2.start(); lfo.start();
      // wind: slowly modulated filtered noise
      const ns = c.createBufferSource(); ns.buffer = this.noiseBuf; ns.loop = true;
      const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 380; nf.Q.value = 0.6;
      const ng = c.createGain(); ng.gain.value = 0.02;
      const wl = c.createOscillator(), wg = c.createGain(); wl.frequency.value = 0.07; wg.gain.value = 0.015; wl.connect(wg); wg.connect(ng.gain);
      ns.connect(nf); nf.connect(ng); ng.connect(this.master); ns.start(); wl.start();
      this.ambientNodes = { g, o1, o2, lfo, ns, wl, ng };
      this.ambientTimer = 4 + Math.random() * 6;
    }
    stopAmbient() {
      const a = this.ambientNodes; if (!a) return;
      try { a.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); a.ng.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); } catch (e) { /* ignore */ }
      setTimeout(() => { try { a.o1.stop(); a.o2.stop(); a.lfo.stop(); a.ns.stop(); a.wl.stop(); } catch (e) { /* ignore */ } }, 900);
      this.ambientNodes = null;
    }
    /** random distant creaks, drips and thumps - call every frame with dt */
    ambientTick(dt) {
      if (!this.ctx || this.muted || !this.ambientNodes) return;
      this.ambientTimer -= dt;
      if (this.ambientTimer > 0) return;
      this.ambientTimer = 5 + Math.random() * 9;
      const r = Math.random();
      if (r < 0.4) this.tone({ f: 160 + Math.random() * 60, f2: 110, dur: 0.8, type: 'sawtooth', gain: 0.025, vibrato: 7 });                      // creak
      else if (r < 0.75) { const f = 900 + Math.random() * 500; this.tone({ f, f2: f * 0.6, dur: 0.12, type: 'sine', gain: 0.05 }); }                // drip
      else this.noise({ dur: 0.6, freq: 120, q: 0.6, type: 'lowpass', gain: 0.1 });                                                                 // distant thump
    }
  }

  root.SFX = SFX;
})(window);
