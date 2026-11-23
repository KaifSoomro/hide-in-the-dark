/* =============================================================================
 * HIDE IN THE DARK - Phaser 3 scene, rendering, input and UI glue.
 *
 *   BootScene : decodes the embedded art (assets.js), slices sprite sheets, builds animations
 *               and generates the small pixel-art props procedurally.
 *   GameScene : owns the match. Simulation lives in logic.js (World, Guard, SoundSystem);
 *               this file turns it into pictures, sound and HUD.
 *
 * Rendering layers (depth):
 *   0      map art
 *   1-4    floor decals (boards, doors)
 *   y      props, loot, characters  (depth-sorted by feet position)
 *   5000   DARKNESS - an off-screen canvas: dark fill with flashlight polygons erased out of it
 *   5050+  glows, sparkles, sound rings, alert icons
 * ========================================================================== */
(function () {
  'use strict';

  const { World, NavMesh, SoundSystem, Guard, GUARD_STATES: GS, dist } = window.StealthLogic;
  const D = window.MAPDATA;
  const sfx = new window.SFX();

  /* ------------------------------- tuning ---------------------------------- */
  const CFG = {
    MATCH_TIME: 240,            // seconds (4 minutes)
    LOOT_NEEDED: 3,           // ALL treasures are required before the exit unlocks
    WALK: 96, RUN: 168,         // px / s
    STAM_MAX: 100, STAM_DRAIN: 26, STAM_REGEN_MOVE: 14, STAM_REGEN_IDLE: 24, STAM_RECOVER_AT: 25,
    WHISTLE_CD: 8,
    SPRITE_SCALE: 0.5,
    AMBIENT: 0.84,              // darkness opacity outside light
    LOOT_RANGE: 72,
  };

  // soft light sources painted into the darkness (candles, lanterns, torches) -> [x, y, radius, strength]
  const STATIC_LIGHTS = [
    [473, 305, 66, 0.55], [645, 305, 66, 0.55], [495, 105, 56, 0.5], [625, 105, 56, 0.5],
    [263, 458, 46, 0.5], [57, 332, 46, 0.45], [905, 212, 52, 0.5], [660, 212, 46, 0.4],
    [808, 738, 70, 0.55], [452, 1090, 66, 0.4], [668, 1090, 66, 0.4], [30, 640, 44, 0.4],
  ];

  const SOUND_COLORS = { walk: 0x9fb4d8, run: 0x9fb4d8, wood: 0xc49a6c, door: 0xe0a050, loot: 0xffd45a, whistle: 0xffffff, metal: 0xc8d0dc, glass: 0x66e0ff, slam: 0xff7a45 };

  const $ = (id) => document.getElementById(id);
  const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const touchInput = { mx: 0, my: 0, run: false, act: false, whistle: false };


  /* ------------------------------- icons ------------------------------------ */
  const ICONS = {
    mask: '<svg viewBox="0 0 24 24"><path d="M12 2.5c-4 0-7 3-7 7V15l-2.5 6h19L19 15V9.5c0-4-3-7-7-7z"/><path d="M8.5 11.5h7"/></svg>',
    chest: '<svg viewBox="0 0 24 24"><path d="M3 10.5a9 5.5 0 0 1 18 0V20H3z"/><path d="M3 11h18"/><rect x="10.3" y="10" width="3.4" height="4.2" rx="0.6"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 8.5V13l3 2M9.5 2.5h5"/></svg>',
    bolt: '<svg viewBox="0 0 24 24"><path class="f" d="M13.5 2 4.5 13.5h6.2L9.8 22l9.7-12H13z"/></svg>',
    whistle: '<svg viewBox="0 0 24 24"><path d="M3 10.5h10.5a5.5 5.5 0 1 1-5 7.8H6A3 3 0 0 1 3 15.3z"/><circle cx="14" cy="15.3" r="1.7"/><path d="M17 5.5l1.2-2M20 7.5l2-1M13 4.5l.2-2"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.4v.2"/></svg>',
    noise: '<svg viewBox="0 0 24 24"><path d="M3 10v4M7 7v10M11 4v16M15 8v8M19 10v4"/></svg>',
    hand: '<svg viewBox="0 0 24 24"><path d="M8 13.2V6.5a1.6 1.6 0 0 1 3.2 0V11m0-1V4.8a1.6 1.6 0 0 1 3.2 0V11m0-4.2a1.6 1.6 0 0 1 3.2 0V14c0 4.2-2.3 7-6.2 7-3 0-4.8-1.8-5.8-3.8L4.6 13.6a1.5 1.5 0 0 1 2.5-1.6z"/></svg>',
    hide: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M12 3v18M9.4 11.5v2.5M14.6 11.5v2.5"/></svg>',
    exit: '<svg viewBox="0 0 24 24"><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/></svg>',
    run: '<svg viewBox="0 0 24 24"><circle cx="14.5" cy="4.5" r="2"/><path d="M9.5 21l2.5-6-3-3 2-4.5 4.5 2 3 2.5M8 12.5l-3.5 1M12 15l4.5 6"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><rect class="f" x="6" y="4.5" width="4" height="15" rx="1"/><rect class="f" x="14" y="4.5" width="4" height="15" rx="1"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path class="f" d="M7 4.5v15l12.5-7.5z"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7M8 12h12"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    sound: '<svg viewBox="0 0 24 24"><path d="M3 9.5v5h4l5 4v-13l-5 4z"/><path d="M16 9a4 4 0 0 1 0 6M18.8 6.3a8 8 0 0 1 0 11.4"/></svg>',
    music: '<svg viewBox="0 0 24 24"><path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg>',
    vibe: '<svg viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="18" rx="2"/><path d="M3.5 8v8M20.5 8v8M5.8 10.5v3M18.2 10.5v3"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M20 11.5A8 8 0 1 0 17.6 17M20 4v7.5h-7.5"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5zM4 5.5v16M8.5 7.5H16"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5M5.5 10v10h13V10"/></svg>',
  };
  const IS_TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  /* ------------------------------- settings --------------------------------- */
  // Persisted in localStorage (silently ignored if the browser blocks storage).
  const Settings = {
    sound: true, music: true, vibration: true, sfxVol: 80, musicVol: 50,
    load() {
      try {
        const o = JSON.parse(localStorage.getItem('hitd_settings') || '{}');
        ['sound', 'music', 'vibration'].forEach((k) => { if (typeof o[k] === 'boolean') this[k] = o[k]; });
        ['sfxVol', 'musicVol'].forEach((k) => { if (typeof o[k] === 'number') this[k] = Math.min(100, Math.max(0, o[k])); });
      } catch (e) { /* storage unavailable */ }
    },
    save() {
      try { localStorage.setItem('hitd_settings', JSON.stringify({ sound: this.sound, music: this.music, vibration: this.vibration, sfxVol: this.sfxVol, musicVol: this.musicVol })); } catch (e) { /* ignore */ }
    },
    /** push the saved values into the audio engine (called once the AudioContext exists) */
    applyAudio() {
      sfx.musicOn = this.music; sfx.muted = !this.sound; sfx.sfxVol = this.sfxVol / 100; sfx.musicVol = this.musicVol / 100;
      sfx.setMuted(!this.sound); sfx.setSfxVolume(this.sfxVol / 100); sfx.setMusicVolume(this.musicVol / 100); sfx.setMusicOn(this.music);
    },
  };
  Settings.load();
  sfx.muted = !Settings.sound; sfx.musicOn = Settings.music; sfx.sfxVol = Settings.sfxVol / 100; sfx.musicVol = Settings.musicVol / 100;

  /** haptic feedback on phones (respects the Vibration setting) */
  function vibrate(pattern) {
    if (!Settings.vibration || typeof navigator === 'undefined' || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  }

  /** fill every <i data-icon="x"> with its inline SVG, and set up the animated menu backdrop */
  function initPageDecor() {
    if (!document.querySelectorAll) return;
    document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = ICONS[el.dataset.icon] || ''; });
    document.querySelectorAll('.menu-bg').forEach((el) => { el.style.backgroundImage = 'url(' + window.ASSETS.map + ')'; });
    const dust = $('dust');
    if (dust && document.createElement) {
      for (let i = 0; i < 22; i++) {
        const sp = document.createElement('span');
        sp.style.left = Math.random() * 100 + '%'; sp.style.animationDuration = 9 + Math.random() * 14 + 's'; sp.style.animationDelay = -Math.random() * 20 + 's';
        sp.style.width = sp.style.height = 2 + Math.random() * 3 + 'px';
        dust.appendChild(sp);
      }
    }
  }

  /* ===========================================================================
   * BOOT: textures, frames, animations
   * ======================================================================== */
  class BootScene extends Phaser.Scene {
    constructor() { super('Boot'); }

    create() {
      // Images are embedded as data URIs, so decode them manually and hand them to the texture manager.
      const keys = Object.keys(window.ASSETS);
      let pending = keys.length, failed = false;
      const done = () => { if (--pending === 0) { if (failed) $('loading-text').textContent = 'Failed to load art assets.'; else this.afterLoad(); } };
      keys.forEach((k) => {
        const img = new Image();
        img.onload = () => { this.textures.addImage(k, img); done(); };
        img.onerror = () => { failed = true; console.error('Asset failed:', k); done(); };
        img.src = window.ASSETS[k];
      });
    }

    afterLoad() {
      this.sliceSheet('thief', window.ATLAS.thief, { idle: 5, walk: 9, run: 12 });
      this.sliceSheet('guard', window.ATLAS.guard, { idle: 5, walk: 9, run: 12 });
      this.makeProceduralTextures();
      this.drawFigure('menu-thief', 'thief', 'idle_down_0');
      this.drawFigure('menu-guard', 'guard', 'idle_down_0');
      this.drawFigure('portrait-thief', 'thief', 'idle_down_0');
      this.drawFigure('portrait-guard', 'guard', 'idle_down_0');
      $('loading').classList.add('hidden');
      this.scene.start('Game');
    }

    /** copy one sprite frame into a <canvas> so the menus can show the characters (pixelated by CSS) */
    drawFigure(canvasId, texKey, frameName) {
      const c = $(canvasId);
      if (!c || !c.getContext) return;
      const tex = this.textures.get(texKey), fr = tex.get(frameName);
      c.width = fr.cutWidth; c.height = fr.cutHeight;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      x.drawImage(tex.getSourceImage(), fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, 0, 0, fr.cutWidth, fr.cutHeight);
    }

    /** Register every named frame in a sprite sheet and build one looping animation per pose group. */
    sliceSheet(texKey, atlas, fps) {
      const tex = this.textures.get(texKey);
      const groups = {};
      atlas.keys.forEach((name, i) => {
        tex.add(name, 0, (i % atlas.cols) * atlas.cw, Math.floor(i / atlas.cols) * atlas.ch, atlas.cw, atlas.ch);
        const m = name.match(/^(.*)_(\d+)$/);
        (groups[m[1]] = groups[m[1]] || []).push({ name, n: +m[2] });
      });
      for (const g in groups) {
        const pose = g.split('_')[0];
        this.anims.create({
          key: texKey + '_' + g,
          frames: groups[g].sort((a, b) => a.n - b.n).map((f) => ({ key: texKey, frame: f.name })),
          frameRate: fps[pose] || 8, repeat: -1,
        });
      }
    }

    /** small pixel-art props drawn with rectangles, so no extra image files are needed */
    makeProceduralTextures() {
      const px = (ctx, rows, pal, s = 1) => rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { ctx.fillStyle = pal[ch]; ctx.fillRect(x * s, y * s, s, s); } }));
      const mk = (key, w, h, fn) => { const t = this.textures.createCanvas(key, w, h); fn(t.getContext('2d')); t.refresh(); return t; };

      mk('glass', 12, 18, (c) => px(c, [
        '....kkkk....', '....kwwk....', '....kccs....', '....kccs....', '...kkccskk..', '..kcccccsk..',
        '.kcwcccccsk.', '.kcwccccccsk'.slice(0, 12), '.kcwccccccsk'.slice(0, 12), '.kccccccccsk'.slice(0, 12), '.kccccccccsk'.slice(0, 12),
        '.kcccccccssk'.slice(0, 12), '.kcccccccssk'.slice(0, 12), '..kssssssskk'.slice(0, 12), '...kkkkkkk..',
      ], { k: '#0b1d2a', c: '#4fb6d8', w: '#d8fbff', s: '#2a7896' }));
      mk('shard', 18, 10, (c) => {
        c.fillStyle = '#5fc9e8'; [[1, 6, 3, 2], [5, 3, 4, 3], [10, 6, 3, 2], [13, 2, 2, 3], [7, 7, 3, 2], [3, 1, 2, 2]].forEach((r) => c.fillRect(...r));
        c.fillStyle = '#e8ffff'; c.fillRect(6, 3, 2, 1); c.fillRect(2, 6, 1, 1);
      });
      mk('metal', 16, 16, (c) => px(c, [
        '..kkkkkkkkkk....', '.kwwwwwwwwwwk...', '.kggggggggggk...', '..kggggggggk....', '..kgwggggddk....', '..kgwggggddk....',
        '..kgwggggddk....', '..kgwggggddk....', '..kgggggdddk....', '..kgggggdddk....', '..kddddddddk....', '...kkkkkkkkk....',
      ], { k: '#161a20', w: '#e1e8f0', g: '#9aa6b5', d: '#5d6877' }));
      mk('metal_down', 20, 12, (c) => px(c, [
        '...kkkkkkkk.........', '..kwwwwwwwwkk.......', '.kwggggggggwkk......', '.kgggggggggdkkkk....', '.kgggggggggdkwgk....',
        '.kddddddddddkkk.....', '..kkkkkkkkkk........',
      ], { k: '#161a20', w: '#e1e8f0', g: '#9aa6b5', d: '#5d6877' }));
      mk('shadow', 32, 14, (c) => {
        const g = c.createRadialGradient(16, 7, 1, 16, 7, 16);
        g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.save(); c.translate(0, 0); c.scale(1, 0.45); c.fillStyle = g; c.beginPath(); c.arc(16, 15.5, 16, 0, Math.PI * 2); c.fill(); c.restore();
      });
      mk('glow', 64, 64, (c) => {
        const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, 64, 64);
      });
      mk('sparkle', 9, 9, (c) => {
        c.fillStyle = '#fff7c0'; c.fillRect(4, 0, 1, 9); c.fillRect(0, 4, 9, 1);
        c.fillStyle = '#ffd24a'; c.fillRect(3, 3, 3, 3); c.fillStyle = '#ffffff'; c.fillRect(4, 4, 1, 1);
      });
    }
  }

  /* ===========================================================================
   * GAME SCENE
   * ======================================================================== */
  class GameScene extends Phaser.Scene {
    constructor() { super('Game'); }

    create() {
      this.state = 'MENU';                         // MENU | PLAYING | PAUSED | OVER
      this.world = new World(D);
      this.nav = new NavMesh(this.world);
      this.sound_ = new SoundSystem();             // (named sound_ : Phaser scenes already own a `sound` plugin)
      this.thief = { x: D.start.x, y: D.start.y, hidden: false, hideSpotId: null };
      this.rng = Math.random;

      this.buildWorldObjects();
      this.buildCharacters();
      this.buildDarkness();
      this.buildFX();
      this.buildInput();

      // camera
      const cam = this.cameras.main;
      cam.setBounds(0, 0, D.W, D.H);
      cam.setZoom(this.computeZoom());
      cam.setBackgroundColor('#04060b');
      cam.centerOn(560, 1000);
      this.scale.on('resize', () => cam.setZoom(this.computeZoom()));

      // sound events -> every guard decides whether it hears it
      this.sound_.onEmit((ev) => { for (const g of this.guards) g.logic.hear(ev); });

      this.resetMatch();
      this.hudTimer = 0; this.lastHud = {};
      this.bindUI();
      window.__game = this;                        // handy for debugging in the console
    }

    computeZoom() {
      const w = this.scale.width, h = this.scale.height;
      return Phaser.Math.Clamp(Math.min(h / 560, w / 520), 0.6, 2.4);
    }

    /* ------------------------------ construction --------------------------- */
    buildWorldObjects() {
      this.add.image(0, 0, 'map').setOrigin(0, 0).setDepth(0);

      // creaky floorboards (decor) and doors (decor) - subtle hints for attentive players
      const deco = this.add.graphics().setDepth(2);
      D.boards.forEach(([x, y, w, h]) => {
        deco.lineStyle(1, 0xd2a46a, 0.22);
        for (let i = 0; i < 4; i++) { const yy = y - h / 2 + (i + 0.5) * (h / 4); deco.lineBetween(x - w / 2, yy, x + w / 2, yy); }
        deco.lineBetween(x - w / 6, y - h / 2, x - w / 6, y + h / 2);
      });
      D.doors.forEach((d) => { deco.lineStyle(1, 0xe8a050, 0.28); deco.strokeRect(d.x - d.w / 2, d.y - d.h / 2, d.w, d.h); });
      this.boards = D.boards.map(([x, y, w, h]) => ({ x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 }));
      this.doors = D.doors.map((d) => ({ id: d.id, x0: d.x - d.w / 2, y0: d.y - d.h / 2, x1: d.x + d.w / 2, y1: d.y + d.h / 2, inside: false, cd: 0 }));
      this.hideSpots = D.hideSpots;

      // loot chests
      this.lootObjs = D.loot.map((l) => {
        const sprite = this.add.image(l.x, l.y, l.sprite).setDepth(l.y - 18);
        const glow = this.add.image(l.x, l.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffc94a).setScale(1.5).setAlpha(0.28).setDepth(5050);
        const spark = this.add.image(l.x + 12, l.y - 24, 'sparkle').setDepth(5060).setScale(1.6);
        this.tweens.add({ targets: [glow], alpha: { from: 0.16, to: 0.36 }, scale: { from: 1.3, to: 1.7 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        this.tweens.add({ targets: [spark], alpha: { from: 0.1, to: 1 }, angle: 90, duration: 700 + Math.random() * 400, yoyo: true, repeat: -1 });
        return { def: l, sprite, glow, spark, collected: false };
      });

      // noisy floor props
      this.propObjs = D.props.map((p) => {
        const sprite = this.add.image(p.x, p.y, p.t === 'glass' ? 'glass' : 'metal').setOrigin(0.5, 0.9).setScale(1.25).setDepth(p.y);
        const shadow = this.add.image(p.x, p.y + 1, 'shadow').setScale(0.5).setDepth(p.y - 1);
        return { def: p, sprite, shadow, triggered: false };
      });

      // exit beacon
      this.exitCenter = { x: (D.exit.x0 + D.exit.x1) / 2, y: (D.exit.y0 + D.exit.y1) / 2 };
      this.exitGlow = this.add.image(this.exitCenter.x, this.exitCenter.y + 20, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0x33ff77).setScale(3.4).setDepth(5050).setAlpha(0.15);
      this.tweens.add({ targets: this.exitGlow, scale: { from: 3.0, to: 3.8 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }

    buildCharacters() {
      const S = CFG.SPRITE_SCALE;
      this.thiefShadow = this.add.image(0, 0, 'shadow').setScale(1.1).setAlpha(0.9);
      this.thiefSprite = this.add.sprite(0, 0, 'thief', 'idle_down_0').setOrigin(0.5, 1).setScale(S);
      this.thiefDir = 'down'; this.thiefAnim = '';

      this.guards = D.guardStart ? Object.keys(D.guardStart).map((id) => {
        const env = { world: this.world, nav: this.nav, hideSpots: D.hideSpots, thief: this.thief, rng: this.rng, onEvent: (n, g, x) => this.onGuardEvent(n, g, x) };
        const logic = new Guard(id, D.routes[id], { x: D.guardStart[id][0], y: D.guardStart[id][1] }, env);
        const shadow = this.add.image(0, 0, 'shadow').setScale(1.1).setAlpha(0.9);
        const sprite = this.add.sprite(0, 0, 'guard', 'idle_down_0').setOrigin(0.5, 1).setScale(S);
        const icon = this.add.text(0, 0, '!', { fontFamily: 'monospace', fontStyle: 'bold', fontSize: '24px', color: '#ff3b30', stroke: '#000000', strokeThickness: 5 }).setOrigin(0.5).setDepth(5200).setVisible(false);
        return { logic, sprite, shadow, icon, curKey: '', prevSusp: 0 };
      }) : [];
    }

    buildDarkness() {
      this.DW = Math.ceil(D.W / 2); this.DH = Math.ceil(D.H / 2);       // half resolution is plenty for soft light
      this.darkTex = this.textures.createCanvas('dark', this.DW, this.DH);
      this.dctx = this.darkTex.getContext('2d');
      this.darkImg = this.add.image(0, 0, 'dark').setOrigin(0, 0).setScale(2).setDepth(5000);
      this.darkTex.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.beamX = new Float32Array(41); this.beamY = new Float32Array(41);  // scratch buffers for wide beam layers
    }

    buildFX() {
      this.fx = this.add.graphics().setDepth(5100);
      this.toastTimer = 0; this.noiseLevel = 0;
    }

    buildInput() {
      const KC = Phaser.Input.Keyboard.KeyCodes;
      this.keys = this.input.keyboard.addKeys({
        w: KC.W, a: KC.A, s: KC.S, d: KC.D, up: KC.UP, down: KC.DOWN, left: KC.LEFT, right: KC.RIGHT,
        shift: KC.SHIFT, q: KC.Q, e: KC.E, space: KC.SPACE, p: KC.P, esc: KC.ESC, m: KC.M, r: KC.R,
      });
    }

    /* ------------------------------ UI binding ----------------------------- */
    bindUI() {
      const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', (e) => { this.ensureAudio(); sfx.click(); fn(e); if (e.currentTarget && e.currentTarget.blur) e.currentTarget.blur(); }); };
      // menus
      on('btn-play', () => this.showScreen('roles'));
      on('btn-start', () => this.startMatch());                 // "Play as Thief"
      on('btn-roles-back', () => this.showScreen('menu'));
      on('btn-howto', () => this.showScreen('howto'));
      on('btn-howto-back', () => this.showScreen('menu'));
      on('btn-settings', () => this.openSettings('menu'));
      on('btn-settings-pause', () => this.openSettings('pause'));
      on('btn-settings-back', () => this.closeSettings());
      on('btn-gear', () => { if (this.state === 'PLAYING') { this.togglePause(); this.openSettings('pause'); } });
      // in-game
      on('btn-pause', () => this.togglePause());
      on('btn-resume', () => this.togglePause());
      on('btn-restart', () => this.startMatch());
      on('btn-restart-pause', () => this.startMatch());
      on('btn-retry-over', () => this.startMatch());
      on('btn-retry-win', () => this.startMatch());
      on('btn-menu-pause', () => this.toMenu());
      on('btn-menu-over', () => this.toMenu());
      on('btn-menu-win', () => this.toMenu());
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'PLAYING') this.togglePause(); });
      // browsers only allow audio after a user gesture: start it on the very first click / key press
      ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => this.ensureAudio()));

      // settings: switches + volume sliders (saved to localStorage)
      const sw = (id, key, after) => { const el = $(id); if (el) el.addEventListener('click', () => { Settings[key] = !Settings[key]; Settings.save(); this.ensureAudio(); after(); this.refreshSettingsUI(); sfx.click(); }); };
      sw('set-sound', 'sound', () => sfx.setMuted(!Settings.sound));
      sw('set-music', 'music', () => sfx.setMusicOn(Settings.music));
      sw('set-vibration', 'vibration', () => vibrate(70));
      const slider = (id, key, fn) => { const el = $(id); if (el) { el.addEventListener('input', (e) => { Settings[key] = +e.target.value; $('out-' + id.slice(4)).textContent = Settings[key]; fn(Settings[key] / 100); Settings.save(); }); el.addEventListener('change', () => { this.ensureAudio(); sfx.click(); }); } };
      slider('set-sfxvol', 'sfxVol', (v) => sfx.setSfxVolume(v));
      slider('set-musicvol', 'musicVol', (v) => sfx.setMusicVolume(v));
      this.refreshSettingsUI();

      // touch controls
      const joy = $('joy'), stick = $('joy-stick');
      if (joy) {
        let pid = null;
        const upd = (e) => {
          const r = joy.getBoundingClientRect(), R = r.width / 2;
          let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R); const l = Math.hypot(dx, dy);
          if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
          touchInput.mx = Math.abs(dx / R) > 0.15 ? dx / R : 0; touchInput.my = Math.abs(dy / R) > 0.15 ? dy / R : 0;
          stick.style.transform = `translate(${dx}px,${dy}px)`;
        };
        joy.addEventListener('pointerdown', (e) => { pid = e.pointerId; joy.setPointerCapture(pid); upd(e); e.preventDefault(); });
        joy.addEventListener('pointermove', (e) => { if (e.pointerId === pid) upd(e); });
        const end = (e) => { if (e.pointerId === pid) { pid = null; touchInput.mx = touchInput.my = 0; stick.style.transform = 'translate(0,0)'; } };
        joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
      }
      const hold = (id, key) => { const el = $(id); if (!el) return; el.addEventListener('pointerdown', (e) => { touchInput[key] = true; el.classList.add('pressed'); e.preventDefault(); }); ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => el.addEventListener(ev, () => { touchInput[key] = false; el.classList.remove('pressed'); })); };
      hold('t-run', 'run');
      const tap = (id, key) => { const el = $(id); if (el) el.addEventListener('pointerdown', (e) => { touchInput[key] = true; vibrate(15); e.preventDefault(); }); };
      tap('t-act', 'act'); tap('t-whistle', 'whistle');
    }

    ensureAudio() {
      sfx.init();
      if (!this.audioReady && sfx.ctx) { this.audioReady = true; Settings.applyAudio(); sfx.startMusic(); }
    }

    refreshSettingsUI() {
      [['set-sound', 'sound'], ['set-music', 'music'], ['set-vibration', 'vibration']].forEach(([id, key]) => {
        const el = $(id); if (!el) return;
        el.classList.toggle('on', !!Settings[key]); if (el.setAttribute) el.setAttribute('aria-checked', String(!!Settings[key]));
      });
      [['set-sfxvol', 'sfxVol', 'out-sfxvol'], ['set-musicvol', 'musicVol', 'out-musicvol']].forEach(([id, key, out]) => { $(id).value = Settings[key]; $(out).textContent = Settings[key]; });
    }

    openSettings(from) { this.settingsFrom = from; this.refreshSettingsUI(); this.showScreen('settings'); }
    closeSettings() { this.showScreen(this.settingsFrom === 'pause' ? 'pause' : 'menu'); }

    toggleSound() {
      Settings.sound = !Settings.sound; Settings.save(); sfx.setMuted(!Settings.sound); this.refreshSettingsUI();
      if (this.state === 'PLAYING') this.toast(Settings.sound ? 'Sound on' : 'Sound off', 900);
    }

    showScreen(name) {
      ['menu', 'roles', 'howto', 'settings', 'pause', 'over', 'win'].forEach((n) => $('screen-' + n).classList.toggle('hidden', n !== name));
    }

    /* ------------------------------ match flow ----------------------------- */
    startMatch() {
      this.resetMatch();
      this.state = 'PLAYING';
      this.showScreen('none');
      $('hud').classList.remove('hidden');
      $('touch-ui').classList.remove('hidden');
      this.ensureAudio(); sfx.stopAmbient(); sfx.startAmbient();
      this.cameras.main.startFollow(this.thiefSprite, true, 0.12, 0.12);
      this.toast(`Steal all ${CFG.LOOT_NEEDED} treasures, then reach the EXIT.`, 4200);
    }

    toMenu() {
      this.resetMatch();
      this.state = 'MENU';
      this.cameras.main.stopFollow(); this.cameras.main.centerOn(560, 1000);
      $('hud').classList.add('hidden'); $('prompt').classList.add('hidden'); $('toast').classList.add('hidden'); $('touch-ui').classList.add('hidden');
      this.showScreen('menu');
      sfx.stopAmbient();
    }

    togglePause() {
      if (this.state === 'PLAYING') {
        this.state = 'PAUSED'; this.tweens.pauseAll(); this.showScreen('pause'); sfx.stopAmbient();
      } else if (this.state === 'PAUSED') {
        this.state = 'PLAYING'; this.tweens.resumeAll(); this.showScreen('none'); sfx.startAmbient();
      }
    }

    resetMatch() {
      this.matchTime = CFG.MATCH_TIME;
      this.stamina = CFG.STAM_MAX; this.exhausted = false;
      this.whistleCd = 0; this.lootCount = 0; this.exitOpen = false;
      this.stats = { time: 0, whistles: 0, spotted: 0 };
      this.stepTimer = 0; this.boardCd = 0; this.hideLock = 0; this.moving = false; this.running = false;
      this.noiseLevel = 0; this.exitHintCd = 0; this.target = null;
      Object.assign(this.thief, { x: D.start.x, y: D.start.y, hidden: false, hideSpotId: null });
      this.thiefDir = 'down'; this.thiefAnim = '';
      this.thiefSprite.clearTint().setAlpha(1);
      this.lootObjs.forEach((o) => { o.collected = false; o.sprite.setVisible(true).setAlpha(1).setScale(1).setPosition(o.def.x, o.def.y); o.glow.setVisible(true); o.spark.setVisible(true); });
      this.propObjs.forEach((o) => {
        o.triggered = false;
        o.sprite.setTexture(o.def.t === 'glass' ? 'glass' : 'metal').setAngle(0).setOrigin(0.5, 0.9).setPosition(o.def.x, o.def.y);
        o.shadow.setVisible(true);
      });
      this.doors.forEach((d) => { d.inside = false; d.cd = 0; });
      this.sound_.clear();
      for (const g of this.guards) {
        g.logic.reset(); g.curKey = ''; g.prevSusp = 0; g.icon.setVisible(false);
        g.logic._refreshFan();
      }
      $('toast').classList.add('hidden');
      this.lastHud = {};
      this.updateHud(true);
    }

    endGame(reason) {
      if (this.state !== 'PLAYING') return;
      this.state = 'OVER';
      sfx.stopAmbient();
      this.cameras.main.stopFollow();
      $('prompt').classList.add('hidden'); $('toast').classList.add('hidden'); $('touch-ui').classList.add('hidden');
      const timeStr = fmtTime(this.stats.time);
      const stats = `Time: ${timeStr} &nbsp;|&nbsp; Loot: ${this.lootCount}/3 &nbsp;|&nbsp; Whistles: ${this.stats.whistles} &nbsp;|&nbsp; Times spotted: ${this.stats.spotted}`;
      if (reason === 'win') {
        sfx.victory(); vibrate([60, 40, 60, 40, 160]);
        $('win-stats').innerHTML = stats;
        this.time.delayedCall(700, () => this.showScreen('win'));
      } else {
        if (reason === 'captured') { sfx.capture(); vibrate(300); this.cameras.main.shake(350, 0.012); this.thiefSprite.setTint(0xff5a5a); }
        else sfx.alert();
        $('over-title').textContent = reason === 'captured' ? 'CAUGHT' : 'DAWN BREAKS';
        $('over-text').textContent = reason === 'captured' ? 'A guard caught you in the dark. The mansion keeps its secrets.' : 'Time ran out. The guards sealed every exit before you could escape.';
        $('over-stats').innerHTML = stats;
        this.time.delayedCall(900, () => this.showScreen('over'));
      }
    }

    /* ------------------------------ guard events --------------------------- */
    onGuardEvent(name, guard, extra) {
      const g = this.guards.find((o) => o.logic === guard);
      switch (name) {
        case 'alert':
          this.stats.spotted++; sfx.alert(); vibrate([90, 50, 90]); this.cameras.main.shake(120, 0.004);
          this.toast('SPOTTED! Break line of sight and hide!', 2400);
          break;
        case 'capture':
          this.endGame('captured'); break;
        case 'inspect':
          if (extra && extra.spot && this.thief.hidden && this.thief.hideSpotId === extra.spot.id && !extra.found) this.toast('A guard checked your hiding spot... and moved on.', 2600);
          break;
        case 'lost':
          this.toast('You lost them. Stay hidden.', 2000); break;
        default: break;
      }
      return g;
    }

    /* ------------------------------ main loop ------------------------------ */
    update(time, delta) {
      const dt = Math.min(delta / 1000, 0.05);
      const K = Phaser.Input.Keyboard;

      if (K.JustDown(this.keys.m)) this.toggleSound();
      if (K.JustDown(this.keys.p) || K.JustDown(this.keys.esc)) {
        const open = (id) => !$('screen-' + id).classList.contains('hidden');
        if (this.state === 'PAUSED' && open('settings')) this.closeSettings();                       // Esc: back out of settings first
        else if (this.state === 'PLAYING' || this.state === 'PAUSED') this.togglePause();
        else if (this.state === 'MENU') { if (open('settings')) this.closeSettings(); else if (open('roles') || open('howto')) this.showScreen('menu'); }
      }
      if (K.JustDown(this.keys.r) && (this.state === 'PLAYING' || this.state === 'OVER')) { sfx.init(); this.startMatch(); }

      if (this.state === 'PLAYING') {
        this.simulate(dt);
        sfx.ambientTick(dt);
      } else if (this.state === 'MENU') {
        // gentle camera drift behind the menu
        const cam = this.cameras.main; cam.scrollX += Math.sin(time / 4000) * 0.15;
      }
      if (this.state !== 'PAUSED') this.sound_.update(this.state === 'PLAYING' ? 0 : dt);   // events are aged inside simulate() while playing

      this.syncSprites(dt);
      this.renderDarkness(time);
      this.renderFX(time);

      this.hudTimer += dt;
      if (this.hudTimer > 0.1) { this.hudTimer = 0; this.updateHud(false); }
    }

    simulate(dt) {
      this.matchTime -= dt; this.stats.time += dt;
      if (this.matchTime <= 0) { this.matchTime = 0; this.endGame('time'); return; }

      this.sound_.update(dt);
      this.noiseLevel = Math.max(0, this.noiseLevel - dt * 1.4);
      if (this.whistleCd > 0) this.whistleCd = Math.max(0, this.whistleCd - dt);
      if (this.hideLock > 0) this.hideLock -= dt;
      if (this.toastTimer > 0) { this.toastTimer -= dt * 1000; if (this.toastTimer <= 0) $('toast').classList.add('hidden'); }

      this.updateThief(dt);
      this.updateTriggers(dt);
      this.updateTarget();
      this.handleActions();

      if (this.state !== 'PLAYING') return;
      for (const g of this.guards) {
        g.logic.update(dt);
        if (this.state !== 'PLAYING') return;                 // a capture may have ended the match
        const susp = g.logic.suspicion;
        if (susp > 0.3 && g.prevSusp <= 0.3) sfx.suspicious();
        g.prevSusp = susp;
      }
      this.checkExit(dt);
    }

    /* ------------------------------ thief ---------------------------------- */
    updateThief(dt) {
      const th = this.thief, k = this.keys;
      if (th.hidden) {
        this.moving = false; this.running = false;
        this.stamina = Math.min(CFG.STAM_MAX, this.stamina + CFG.STAM_REGEN_IDLE * 1.4 * dt);
        if (this.exhausted && this.stamina >= CFG.STAM_RECOVER_AT) this.exhausted = false;
        return;
      }
      let mx = (k.d.isDown || k.right.isDown ? 1 : 0) - (k.a.isDown || k.left.isDown ? 1 : 0) + touchInput.mx;
      let my = (k.s.isDown || k.down.isDown ? 1 : 0) - (k.w.isDown || k.up.isDown ? 1 : 0) + touchInput.my;
      const len = Math.hypot(mx, my);
      if (len > 1) { mx /= len; my /= len; }                          // 8-directional movement, no faster diagonals
      this.moving = len > 0.05;

      this.running = this.moving && (k.shift.isDown || touchInput.run) && this.stamina > 0 && !this.exhausted;
      if (this.running) {
        this.stamina -= CFG.STAM_DRAIN * dt;
        if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; this.toast('Out of breath!', 1200); }
      } else {
        this.stamina = Math.min(CFG.STAM_MAX, this.stamina + (this.moving ? CFG.STAM_REGEN_MOVE : CFG.STAM_REGEN_IDLE) * dt);
        if (this.exhausted && this.stamina >= CFG.STAM_RECOVER_AT) this.exhausted = false;
      }

      if (this.moving) {
        const sp = this.running ? CFG.RUN : CFG.WALK;
        this.world.moveEntity(th, mx * sp * dt, my * sp * dt);
        if (Math.abs(mx) > Math.abs(my) * 0.8) this.thiefDir = mx > 0 ? 'right' : 'left';
        else this.thiefDir = my > 0 ? 'down' : 'up';

        // footsteps: noise events + sound
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          this.stepTimer = this.running ? 0.27 : 0.5;
          this.sound_.emit(this.running ? 'run' : 'walk', th.x, th.y);
          sfx.footstep(this.running);
          this.noiseLevel = Math.max(this.noiseLevel, this.running ? 0.5 : 0.2);
        }
      } else this.stepTimer = 0.05;
    }

    /** floor props, creaky boards and doors react to the thief walking / running over them */
    updateTriggers(dt) {
      const th = this.thief;
      if (th.hidden) return;
      // glass & metal
      const reach = this.running ? 20 : 14;
      for (const p of this.propObjs) {
        if (p.triggered) continue;
        if (dist(th.x, th.y, p.def.x, p.def.y) < reach) {
          p.triggered = true;
          if (p.def.t === 'glass') { p.sprite.setTexture('shard').setOrigin(0.5, 0.5); this.sound_.emit('glass', p.def.x, p.def.y); sfx.glass(); this.toast('Glass shattered!', 1200); }
          else { p.sprite.setTexture('metal_down').setOrigin(0.5, 0.6); this.sound_.emit('metal', p.def.x, p.def.y); sfx.metal(); this.toast('You knocked something metal over!', 1200); }
          p.shadow.setVisible(false);
          this.noiseLevel = 1;
          this.cameras.main.shake(90, 0.003);
        }
      }
      // wooden floorboards creak while moving across them
      this.boardCd -= dt;
      if (this.moving && this.boardCd <= 0) {
        for (const b of this.boards) {
          if (th.x > b.x0 && th.x < b.x1 && th.y > b.y0 && th.y < b.y1) {
            this.boardCd = 0.9; this.sound_.emit('wood', th.x, th.y); sfx.wood(); this.noiseLevel = Math.max(this.noiseLevel, 0.45); break;
          }
        }
      }
      // doorways: walk = creak, run = slam
      for (const d of this.doors) {
        d.cd -= dt;
        const inside = th.x > d.x0 && th.x < d.x1 && th.y > d.y0 && th.y < d.y1;
        if (inside && !d.inside && d.cd <= 0) {
          d.cd = 1.6;
          const cx = (d.x0 + d.x1) / 2, cy = (d.y0 + d.y1) / 2;
          if (this.running) { this.sound_.emit('slam', cx, cy); sfx.door(true); vibrate(60); this.cameras.main.shake(140, 0.005); this.noiseLevel = 1; this.toast('The door slammed shut behind you!', 1500); }
          else { this.sound_.emit('door', cx, cy); sfx.door(false); this.noiseLevel = Math.max(this.noiseLevel, 0.4); }
        }
        d.inside = inside;
      }
    }

    /** what would pressing E do right now? */
    updateTarget() {
      const th = this.thief;
      if (th.hidden) { this.target = { kind: 'leave' }; return; }
      let best = null, bd = 1e9;
      this.lootObjs.forEach((o) => {
        if (o.collected) return;
        const d = dist(th.x, th.y, o.def.x, o.def.y);
        if (d <= CFG.LOOT_RANGE && d < bd) { bd = d; best = { kind: 'loot', obj: o, name: o.def.name }; }
      });
      this.hideSpots.forEach((h) => {
        const d = dist(th.x, th.y, h.x, h.y);
        if (d <= h.r && d + 18 < bd) { bd = d + 18; best = { kind: 'hide', spot: h, name: h.name }; }
      });
      this.target = best;
    }

    handleActions() {
      const K = Phaser.Input.Keyboard, k = this.keys;
      const act = K.JustDown(k.e) || K.JustDown(k.space) || touchInput.act;
      const whistle = K.JustDown(k.q) || touchInput.whistle;
      touchInput.act = false; touchInput.whistle = false;
      if (whistle) this.doWhistle();
      if (act) this.doInteract();
    }

    doWhistle() {
      if (this.whistleCd > 0) { sfx.deny(); return; }
      const th = this.thief;
      this.whistleCd = CFG.WHISTLE_CD; this.stats.whistles++;
      this.sound_.emit('whistle', th.x, th.y);      // a sound EVENT at this spot - guards walk to where it was, nothing more
      sfx.whistle();
      this.noiseLevel = Math.max(this.noiseLevel, 0.8);
      this.floatText(th.x, th.y - 52, '\u266A', '#ffffff', 22);
      this.floatText(th.x + 14, th.y - 40, '\u266B', '#cfe3ff', 18);
    }

    doInteract() {
      const th = this.thief, tg = this.target;
      if (!tg) { sfx.deny(); return; }
      if (tg.kind === 'leave') {
        if (this.hideLock > 0) return;
        th.hidden = false; th.hideSpotId = null; this.hideLock = 0.35;
        this.thiefSprite.setAlpha(1); sfx.hide(false);
        return;
      }
      if (tg.kind === 'hide') {
        if (this.hideLock > 0) return;
        // can't duck into a hiding place while a guard is actively watching you
        if (this.guards.some((g) => g.logic.canSee && g.logic.state === GS.CHASE)) { this.toast("They're watching you - break line of sight first!", 1800); sfx.deny(); return; }
        th.hidden = true; th.hideSpotId = tg.spot.id; th.x = tg.spot.ax; th.y = tg.spot.ay; this.hideLock = 0.35;
        sfx.hide(true);
        this.toast('Hidden in ' + tg.spot.name + '. Press E to leave.', 2200);
        return;
      }
      if (tg.kind === 'loot') this.collectLoot(tg.obj);
    }

    collectLoot(o) {
      o.collected = true; this.lootCount++;
      sfx.pickup(); vibrate(35); this.sound_.emit('loot', o.def.x, o.def.y); this.noiseLevel = Math.max(this.noiseLevel, 0.4);
      o.glow.setVisible(false); o.spark.setVisible(false);
      this.tweens.add({ targets: o.sprite, y: o.def.y - 34, alpha: 0, scale: 1.5, duration: 520, ease: 'Cubic.out', onComplete: () => o.sprite.setVisible(false) });
      this.floatText(o.def.x, o.def.y - 30, '+1 LOOT', '#ffd45a', 16);
      for (let i = 0; i < 12; i++) {          // sparkle burst
        const a = (i / 12) * Math.PI * 2, r = this.add.rectangle(o.def.x, o.def.y - 10, 4, 4, i % 2 ? 0xfff2a0 : 0xffb830).setDepth(5150);
        this.tweens.add({ targets: r, x: o.def.x + Math.cos(a) * 46, y: o.def.y - 10 + Math.sin(a) * 36, alpha: 0, duration: 520, ease: 'Cubic.out', onComplete: () => r.destroy() });
      }
      if (this.lootCount >= CFG.LOOT_NEEDED && !this.exitOpen) {
        this.exitOpen = true; sfx.exitOpen(); this.toast('EXIT OPEN! Head to the green door (top right).', 4000);
      } else this.toast(`Loot ${this.lootCount}/${CFG.LOOT_NEEDED}`, 1400);
    }

    checkExit(dt) {
      const th = this.thief, e = D.exit;
      this.exitHintCd -= dt;
      if (th.x > e.x0 && th.x < e.x1 && th.y > e.y0 && th.y < e.y1) {
        if (this.exitOpen) { this.endGame('win'); }
        else if (this.exitHintCd <= 0) { this.exitHintCd = 2.5; this.toast(`The exit is locked - you need ${CFG.LOOT_NEEDED} treasures.`, 2000); sfx.deny(); }
      }
    }

    floatText(x, y, str, color, size) {
      const t = this.add.text(x, y, str, { fontFamily: 'monospace', fontStyle: 'bold', fontSize: size + 'px', color, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(5200);
      this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 1100, ease: 'Cubic.out', onComplete: () => t.destroy() });
    }

    toast(msg, ms) {
      const el = $('toast'); el.textContent = msg; el.classList.remove('hidden');
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';     // restart CSS animation
      this.toastTimer = ms || 2000;
    }

    /* ------------------------------ sprites -------------------------------- */
    syncSprites() {
      const th = this.thief;
      // thief
      this.thiefShadow.setPosition(th.x, th.y + 1).setDepth(th.y - 1).setVisible(!th.hidden);
      this.thiefSprite.setPosition(th.x, th.y + 1).setDepth(th.y);
      if (this.state !== 'OVER') {
        const pose = this.moving ? (this.running ? 'run' : 'walk') : 'idle';
        const key = 'thief_' + pose + '_' + this.thiefDir;
        if (key !== this.thiefAnim) { this.thiefAnim = key; this.thiefSprite.play(key); }
      }
      if (th.hidden) this.thiefSprite.setAlpha(0.16 + Math.sin(this.time.now / 500) * 0.04);

      // guards
      for (const g of this.guards) {
        const L = g.logic, a = L.angle;
        let dir;
        if (Math.abs(a) <= Math.PI / 4) dir = 'right'; else if (a > Math.PI / 4 && a < 3 * Math.PI / 4) dir = 'down';
        else if (Math.abs(a) >= 3 * Math.PI / 4) dir = 'left'; else dir = 'up';
        const pose = L.state === GS.CHASE && L.moving ? 'run' : (L.moving ? 'walk' : 'idle');
        const key = 'guard_' + pose + '_' + dir;
        if (key !== g.curKey) { g.curKey = key; g.sprite.play(key); }
        g.sprite.setPosition(L.x, L.y + 1).setDepth(L.y);
        g.shadow.setPosition(L.x, L.y + 1).setDepth(L.y - 1);

        // alert icon: ! chase, ? investigating / searching / suspicious
        let ch = '', col = '#ffd33a';
        if (L.state === GS.CHASE || L.state === GS.CAPTURE) { ch = '!'; col = '#ff3b30'; }
        else if (L.suspicion > 0.2 || L.state === GS.INVESTIGATE || L.state === GS.SEARCH) { ch = '?'; col = L.suspicion > 0.2 ? '#ff9f2e' : '#ffd33a'; }
        if (ch) { g.icon.setText(ch).setColor(col).setPosition(L.x, L.y - 62 + Math.sin(this.time.now / 140) * 2).setVisible(true); }
        else g.icon.setVisible(false);
      }
      // exit beacon brightness: dim & red until the exit is unlocked
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 300);
      if (this.exitOpen) { this.exitGlow.setTint(0x33ff77).setAlpha(0.3 + 0.25 * pulse); }
      else { this.exitGlow.setTint(0x22aa55).setAlpha(0.1); }
    }

    /* ------------------------------ lighting -------------------------------- */
    renderDarkness() {
      const c = this.dctx, W = this.DW, H = this.DH;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = `rgba(3,5,12,${CFG.AMBIENT})`;
      c.fillRect(0, 0, W, H);

      c.setTransform(0.5, 0, 0, 0.5, 0, 0);                    // draw in world coordinates from here on
      c.globalCompositeOperation = 'destination-out';           // "erasing" the darkness = light

      const glowAt = (x, y, r, a) => {
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.55, `rgba(0,0,0,${a * 0.55})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
      };
      for (const l of STATIC_LIGHTS) glowAt(l[0], l[1], l[2], l[3]);
      this.lootObjs.forEach((o) => { if (!o.collected) glowAt(o.def.x, o.def.y, 38, 0.35); });
      glowAt(this.exitCenter.x, this.exitCenter.y + 30, 110, this.exitOpen ? 0.75 : 0.32);

      // thief: a faint personal glow so the player can always see themselves
      const th = this.thief;
      if (th.hidden) glowAt(th.x, th.y - 8, 34, 0.25); else glowAt(th.x, th.y - 10, 80, 0.55);

      // guards: body glow + flashlight beam (3 layered polygons => soft edge)
      for (const g of this.guards) {
        const L = g.logic;
        glowAt(L.x, L.y - 12, 26, 0.28);                       // faint glow so the guard's silhouette is visible
        this.drawBeam(c, L, 1.3, 0.26);
        this.drawBeam(c, L, 1.12, 0.32);
        this.drawBeam(c, L, 1.0, 0.82);
      }

      // warm tint inside the beams
      c.globalCompositeOperation = 'source-over';
      for (const g of this.guards) {
        const L = g.logic;
        const grd = c.createRadialGradient(L.ox, L.oy, 8, L.ox, L.oy, L.beamRange);
        const chase = L.state === GS.CHASE;
        grd.addColorStop(0, chase ? 'rgba(255,150,120,0.26)' : 'rgba(255,236,170,0.24)'); grd.addColorStop(1, 'rgba(255,236,170,0)');
        c.fillStyle = grd; c.beginPath(); c.moveTo(L.ox, L.oy);
        for (let i = 0; i < L.fanN; i++) c.lineTo(L.fanX[i], L.fanY[i]);
        c.closePath(); c.fill();
      }
      this.darkTex.refresh();
    }

    /** erase one flashlight polygon; scale>1 widens the cone for the feathered edge layers */
    drawBeam(c, L, scale, alpha) {
      let xs = L.fanX, ys = L.fanY, n = L.fanN;
      if (scale !== 1) { n = this.world.castFan(L.ox, L.oy, L.angle, Math.min(1.5, L.beamHalf * scale), L.beamRange * (0.92 + 0.08 * scale), 40, this.beamX, this.beamY); xs = this.beamX; ys = this.beamY; }
      const grd = c.createRadialGradient(L.ox, L.oy, 4, L.ox, L.oy, L.beamRange * scale * 0.96);
      grd.addColorStop(0, `rgba(0,0,0,${alpha})`); grd.addColorStop(0.6, `rgba(0,0,0,${alpha * 0.8})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = grd; c.beginPath(); c.moveTo(L.ox, L.oy);
      for (let i = 0; i < n; i++) c.lineTo(xs[i], ys[i]);
      c.closePath(); c.fill();
    }

    /* ------------------------------ overlay fx ------------------------------ */
    renderFX(time) {
      const g = this.fx; g.clear();
      const th = this.thief;

      // sound rings
      for (const ev of this.sound_.events) {
        const t = ev.age / ev.life, r = ev.radius * (1 - Math.pow(1 - t, 3));
        const a = (1 - t) * (ev.type === 'walk' ? 0.28 : ev.type === 'run' ? 0.4 : 0.7);
        g.lineStyle(ev.radius > 200 ? 3 : 2, SOUND_COLORS[ev.type] || 0xffffff, a);
        g.strokeCircle(ev.x, ev.y, r);
        if (ev.intensity >= 0.85 && t > 0.15) { g.lineStyle(2, SOUND_COLORS[ev.type] || 0xffffff, a * 0.6); g.strokeCircle(ev.x, ev.y, r * 0.72); }
      }

      // hiding-place and interaction hints near the thief
      if (this.state === 'PLAYING') {
        for (const h of this.hideSpots) {
          const d = dist(th.x, th.y, h.x, h.y);
          if (d < 150) {
            const near = this.target && this.target.spot === h;
            const alpha = near ? 0.9 : Phaser.Math.Clamp((150 - d) / 100, 0, 0.5);
            g.lineStyle(2, 0xb47bff, alpha); g.strokeRect(h.x - 8, h.y - 8, 16, 16);
            g.fillStyle(0xb47bff, alpha * 0.4); g.fillRect(h.x - 4, h.y - 4, 8, 8);
          }
        }
      }

      // the flashlight: a little torch held in the guard's hand - the beam starts at its lens
      for (const gd of this.guards) {
        const L = gd.logic, ca = Math.cos(L.angle), sa = Math.sin(L.angle), hot = L.state === GS.CHASE || L.state === GS.CAPTURE;
        g.lineStyle(4, 0x14171d, 1); g.lineBetween(L.ox - ca * 8, L.oy - sa * 8, L.ox, L.oy);       // body of the torch
        g.lineStyle(2, 0x6f7a90, 1); g.lineBetween(L.ox - ca * 8, L.oy - sa * 8, L.ox - ca * 1, L.oy - sa * 1);
        g.fillStyle(hot ? 0xff7a60 : 0xffd96a, 0.28); g.fillCircle(L.ox + ca * 2, L.oy + sa * 2, 9);   // glow
        g.fillStyle(hot ? 0xffb0a0 : 0xfff6c8, 1); g.fillCircle(L.ox + ca * 1.5, L.oy + sa * 1.5, 3);  // lens
      }

      // guard suspicion meters
      for (const gd of this.guards) {
        const L = gd.logic;
        if (L.suspicion > 0.02 && L.state !== GS.CHASE && L.state !== GS.CAPTURE) {
          const w = 28, x = L.x - w / 2, y = L.y - 54;
          g.fillStyle(0x000000, 0.65); g.fillRect(x - 1, y - 1, w + 2, 6);
          g.fillStyle(L.suspicion > 0.6 ? 0xff4a3a : 0xffc93a, 1); g.fillRect(x, y, w * L.suspicion, 4);
        }
      }
    }

    /* ------------------------------ HUD ------------------------------------- */
    updateHud(force) {
      const set = (id, val) => { if (force || this.lastHud[id] !== val) { this.lastHud[id] = val; $(id).textContent = val; } };
      const cls = (id, c, on) => { const k = id + '.' + c; if (force || this.lastHud[k] !== on) { this.lastHud[k] = on; $(id).classList.toggle(c, on); } };

      set('hud-time', fmtTime(this.matchTime));
      cls('hud-time-box', 'danger', this.matchTime <= 30 && this.state === 'PLAYING');
      set('hud-loot', `${this.lootCount}/${CFG.LOOT_NEEDED}`);
      cls('hud-loot-box', 'done', this.lootCount >= CFG.LOOT_NEEDED);

      // alert status: LOW / SUSPICIOUS / DETECTED (+ HIDDEN while concealed)
      let level = 0;
      for (const g of this.guards) {
        const L = g.logic;
        if (L.state === GS.CHASE || L.state === GS.CAPTURE) level = 3;
        else if ((L.suspicion > 0.2 || L.state === GS.INVESTIGATE || L.state === GS.SEARCH) && level < 2) level = 2;
      }
      let status = level === 3 ? 'DETECTED' : level === 2 ? 'SUSPICIOUS' : 'LOW';
      if (this.thief.hidden && level < 3) status = level === 2 ? 'HIDDEN \u2022 SEARCH' : 'HIDDEN';
      set('hud-alert', status);
      if (force || this.lastHud.level !== level) { this.lastHud.level = level; $('hud-alert-box').className = 'chip alert-' + level; }

      // stamina
      const sp = Math.round((this.stamina / CFG.STAM_MAX) * 100);
      if (force || this.lastHud.stam !== sp) { this.lastHud.stam = sp; $('hud-stamina-fill').style.width = sp + '%'; }
      cls('hud-stamina-box', 'low', this.exhausted);

      // whistle: no bar, just READY (or the seconds left while it recharges)
      const wReady = this.whistleCd <= 0;
      set('hud-whistle-text', wReady ? 'READY' : Math.ceil(this.whistleCd) + 's');
      cls('hud-whistle-box', 'ready', wReady);

      // noise pips
      const lv = this.noiseLevel > 0.75 ? 4 : this.noiseLevel > 0.4 ? 3 : this.noiseLevel > 0.15 ? 2 : this.noiseLevel > 0.02 ? 1 : 0;
      if (force || this.lastHud.noise !== lv) {
        this.lastHud.noise = lv;
        [...$('hud-noise').children].forEach((p, i) => p.classList.toggle('on', i < lv));
      }

      // contextual action: floating prompt (desktop shows the key) + the touch action button (icon changes per action)
      const t = this.state === 'PLAYING' ? this.target : null;
      let pr = '';
      if (t) {
        const verb = t.kind === 'leave' ? 'Leave hiding spot' : t.kind === 'hide' ? `Hide in ${t.name}` : `Take ${t.name}`;
        pr = IS_TOUCH ? verb : '[E] ' + verb;
      }
      if (force || this.lastHud.prompt !== pr) { this.lastHud.prompt = pr; const el = $('prompt'); el.textContent = pr; el.classList.toggle('hidden', !pr); }
      const kind = t ? t.kind : '';
      if (force || this.lastHud.kind !== kind) {
        this.lastHud.kind = kind;
        const b = $('t-act'); b.classList.toggle('hidden', !kind);
        if (kind) { b.dataset.kind = kind; $('t-act-label').textContent = kind === 'loot' ? 'TAKE' : kind === 'hide' ? 'HIDE' : 'LEAVE'; }
      }
    }
  }

  /* ===========================================================================
   * START
   * ======================================================================== */
  window.addEventListener('load', () => {
    initPageDecor();
    if (!window.Phaser) { $('loading-text').textContent = 'Phaser failed to load (check your internet connection).'; return; }
    new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-container',
      backgroundColor: '#04060b',
      scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
      render: { pixelArt: true, antialias: false, roundPixels: true },
      scene: [BootScene, GameScene],
      input: { keyboard: true, touch: true },
    });
  });
})();
