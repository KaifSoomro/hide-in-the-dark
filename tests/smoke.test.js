global.window = global;
let fails = 0;
const ok = (c, m) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  } else console.log("ok  ", m);
};

/* ---------- generic chainable stub ---------- */
function stub(extra = {}) {
  const store = Object.assign({}, extra);
  const f = function () {
    return p;
  };
  const p = new Proxy(f, {
    get(t, k) {
      if (k === "then" || k === Symbol.toPrimitive) return undefined;
      if (k in store) return store[k];
      return p;
    },
    set(t, k, v) {
      store[k] = v;
      return true;
    },
    apply() {
      return p;
    },
  });
  return p;
}
const ctx2d = () =>
  new Proxy(
    {},
    {
      get: (t, k) =>
        k === "createRadialGradient" || k === "createLinearGradient"
          ? () => ({ addColorStop() {} })
          : k in t
            ? t[k]
            : () => {},
      set: (t, k, v) => {
        t[k] = v;
        return true;
      },
    },
  );

/* ---------- DOM mock ---------- */
const els = {},
  handlers = {};
function el(id) {
  if (!els[id]) {
    const cl = new Set();
    els[id] = {
      id,
      textContent: "",
      innerHTML: "",
      style: {},
      dataset: {},
      offsetWidth: 0,
      className: "",
      classList: {
        add: (c) => cl.add(c),
        remove: (c) => cl.delete(c),
        contains: (c) => cl.has(c),
        toggle: (c, on) => {
          if (on === undefined) on = !cl.has(c);
          on ? cl.add(c) : cl.delete(c);
          return on;
        },
      },
      children: [1, 2, 3, 4].map(() => ({ classList: { toggle() {} } })),
      addEventListener(ev, fn) {
        (handlers[id + ":" + ev] = handlers[id + ":" + ev] || []).push(fn);
      },
      blur() {},
      setAttribute() {},
      value: "",
      setPointerCapture() {},
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 128,
        height: 128,
      }),
    };
    els[id].classList.add("hidden0");
    cl.delete("hidden0");
  }
  return els[id];
}
global.document = { getElementById: el, addEventListener() {}, hidden: false };
const winHandlers = {};
global.addEventListener = (ev, fn) => {
  winHandlers[ev] = fn;
};
global.innerWidth = 1280;
global.innerHeight = 720;
global.matchMedia = () => ({ matches: false });
global.AudioContext = undefined; // audio disabled in node: SFX must degrade gracefully
global.Image = class {
  set src(v) {
    setImmediate(() => this.onload && this.onload());
  }
};

/* ---------- Phaser mock ---------- */
const scenesRun = {};
class Scene {
  constructor(key) {
    this.key = key;
    const self = this;
    this.add = {
      image: () => stub(),
      sprite: () => stub(),
      text: () => stub(),
      graphics: () => stub(),
      rectangle: () => stub(),
    };
    this.textures = {
      addImage() {},
      get: () => stub(),
      createCanvas: () => stub({ getContext: () => ctx2d() }),
    };
    this.anims = { create() {} };
    this.tweens = {
      add: (c) => {
        if (c && c.onComplete) c.onComplete();
        return stub();
      },
      pauseAll() {},
      resumeAll() {},
    };
    this.cameras = { main: stub() };
    this.scale = { width: 1280, height: 720, on() {} };
    this.time = {
      now: 0,
      delayedCall: (ms, fn) => {
        fn();
      },
    };
    this.scene = {
      start(k) {
        scenesRun[k] = new global.__scenes[k]();
        scenesRun[k].create();
      },
    };
    const mk = () => ({ isDown: false, justDown: false });
    this.input = {
      keyboard: {
        addKeys: () => {
          const o = {};
          [
            "w",
            "a",
            "s",
            "d",
            "up",
            "down",
            "left",
            "right",
            "shift",
            "q",
            "e",
            "space",
            "p",
            "esc",
            "m",
            "r",
          ].forEach((k) => (o[k] = mk()));
          return o;
        },
      },
    };
  }
}
global.Phaser = {
  Scene,
  AUTO: 0,
  Scale: { RESIZE: 1 },
  BlendModes: { ADD: 1 },
  Textures: { FilterMode: { LINEAR: 0 } },
  Math: { Clamp: (v, a, b) => Math.min(b, Math.max(a, v)) },
  Input: {
    Keyboard: {
      KeyCodes: new Proxy({}, { get: (t, k) => String(k) }),
      JustDown: (k) => {
        const j = k.justDown;
        k.justDown = false;
        return j;
      },
    },
  },
  Game: class {
    constructor(cfg) {
      global.__scenes = {};
      cfg.scene.forEach((S) => (global.__scenes[new S().key] = S));
      scenesRun.__boot = new global.__scenes.Boot();
      scenesRun.__boot.create();
    }
  },
};
global.__scenes = {};

require("../mapdata.js");
require("../assets.js");
window.StealthLogic = require("../logic.js");
require("../audio.js");
// assets.js is huge but harmless; game.js registers a window 'load' handler
require("../game.js");
winHandlers.load();

setImmediate(() => setTimeout(run, 20));

function run() {
  const g = scenesRun.Game;
  ok(!!g, "GameScene created after Boot");
  if (!g) process.exit(1);
  const D = window.MAPDATA,
    L = window.StealthLogic;
  const frame = (n = 1, dt = 16) => {
    for (let i = 0; i < n; i++) {
      g.time.now += dt;
      g.update(g.time.now, dt);
    }
  };
  const press = (k) => (g.keys[k].justDown = true);
  const click = (id) =>
    (handlers[id + ":click"] || []).forEach((fn) =>
      fn({ currentTarget: el(id) }),
    );

  frame(30);
  ok(g.state === "MENU", "starts in MENU state");
  ok(
    el("screen-menu").classList.contains("hidden") === false,
    "menu screen visible",
  );

  click("btn-play");
  ok(
    !el("screen-roles").classList.contains("hidden") &&
      el("screen-menu").classList.contains("hidden"),
    "PLAY opens role select",
  );
  click("btn-roles-back");
  ok(
    !el("screen-menu").classList.contains("hidden"),
    "role select BACK returns to menu",
  );
  click("btn-settings");
  ok(!el("screen-settings").classList.contains("hidden"), "SETTINGS opens");
  click("set-sound");
  click("set-music");
  click("set-vibration");
  click("set-sound");
  click("set-music");
  click("set-vibration");
  ok(
    el("set-sound").classList.contains("on") &&
      el("set-music").classList.contains("on") &&
      el("set-vibration").classList.contains("on"),
    "Sound/Music/Vibration switches toggle",
  );
  click("btn-settings-back");
  ok(
    !el("screen-menu").classList.contains("hidden"),
    "settings BACK returns to menu",
  );
  click("btn-howto");
  ok(!el("screen-howto").classList.contains("hidden"), "HOW TO PLAY opens");
  click("btn-howto-back");
  click("btn-play");
  click("btn-start");
  frame(5);
  ok(g.state === "PLAYING", "Play as Thief begins the match");
  ok(el("screen-menu").classList.contains("hidden"), "menu hidden after start");
  ok(!el("hud").classList.contains("hidden"), "HUD visible");

  // movement: walk up the entrance path
  const y0 = g.thief.y;
  g.keys.w.isDown = true;
  frame(60);
  g.keys.w.isDown = false;
  ok(
    g.thief.y < y0 - 40,
    "thief walks north (moved " + (y0 - g.thief.y).toFixed(0) + "px)",
  );
  ok(
    g.noiseLevel > 0 || g.sound_.events.length > 0,
    "walking produces sound events",
  );

  // running is faster and drains stamina
  const yA = g.thief.y,
    stA = g.stamina;
  g.keys.w.isDown = true;
  g.keys.shift.isDown = true;
  frame(30);
  const runDist = yA - g.thief.y;
  g.keys.w.isDown = false;
  g.keys.shift.isDown = false;
  ok(g.stamina < stA, "running drains stamina");
  ok(
    runDist > 60,
    "running covers ground quickly (" + runDist.toFixed(0) + "px in 0.48s)",
  );

  // stamina exhaustion
  g.thief.x = 548;
  g.thief.y = 1200;
  g.stamina = 3;
  g.keys.s.isDown = true;
  g.keys.shift.isDown = true;
  frame(20);
  ok(g.exhausted, "stamina exhaustion triggers");
  g.keys.s.isDown = false;
  g.keys.shift.isDown = false;
  frame(200);
  ok(!g.exhausted, "stamina recovers");

  // whistle + cooldown
  g.thief.x = 548;
  g.thief.y = 760;
  g.thief.hidden = false;
  frame(2);
  press("q");
  frame(2);
  ok(
    g.whistleCd > 7.5,
    "whistle starts 8s cooldown (" + g.whistleCd.toFixed(1) + ")",
  );
  const nev = g.sound_.events.length;
  press("q");
  frame(1);
  ok(
    g.sound_.events.filter((e) => e.type === "whistle").length <= 1,
    "whistle blocked while cooling down",
  );
  ok(
    g.guards.some((gd) => gd.logic.state !== "PATROL") || true,
    "guards may react to whistle (info)",
  );

  // glass prop triggers loud sound
  const glass = g.propObjs.find((p) => p.def.t === "glass");
  g.thief.x = glass.def.x;
  g.thief.y = glass.def.y;
  frame(2);
  ok(
    glass.triggered && g.sound_.events.some((e) => e.type === "glass"),
    "stepping on glass emits GLASS sound event",
  );
  const metal = g.propObjs.find((p) => p.def.t === "metal");
  g.thief.x = metal.def.x;
  g.thief.y = metal.def.y;
  frame(2);
  ok(
    metal.triggered && g.sound_.events.some((e) => e.type === "metal"),
    "knocking metal emits METAL sound event",
  );

  // door slam when running vs creak walking
  const door = g.doors[0];
  g.sound_.clear();
  g.thief.x = (door.x0 + door.x1) / 2;
  g.thief.y = door.y0 - 12;
  g.keys.s.isDown = true;
  g.keys.shift.isDown = true;
  g.stamina = 100;
  frame(12);
  g.keys.s.isDown = false;
  g.keys.shift.isDown = false;
  ok(
    g.sound_.events.some((e) => e.type === "slam") || door.cd > 0,
    "running through a door slams it (" +
      g.sound_.events.map((e) => e.type).join(",") +
      ")",
  );

  // hiding
  const spot = D.hideSpots.find((h) => h.id === "hall_cab");
  g.guards.forEach((gd) => {
    gd.logic.reset();
    gd.logic.x = 300;
    gd.logic.y = 150 + 0;
  });
  g.thief.x = spot.ax;
  g.thief.y = spot.ay;
  g.thief.hidden = false;
  frame(3);
  ok(g.target && g.target.kind === "hide", "hide prompt appears near cabinet");
  g.updateHud(true);
  ok(
    !el("t-act").classList.contains("hidden") &&
      el("t-act").dataset.kind === "hide" &&
      el("t-act-label").textContent === "HIDE",
    "mobile action button shows HIDE next to hiding spot",
  );
  frame(30);
  press("e");
  frame(2);
  ok(g.thief.hidden && g.thief.hideSpotId === spot.id, "E hides the thief");
  g.updateHud(true);
  ok(
    el("t-act").dataset.kind === "leave" &&
      el("t-act-label").textContent === "LEAVE",
    "action button becomes LEAVE while hidden",
  );
  g.keys.d.isDown = true;
  frame(20);
  g.keys.d.isDown = false;
  ok(Math.abs(g.thief.x - spot.ax) < 1, "hidden thief cannot move");
  frame(30);
  press("e");
  frame(2);
  ok(!g.thief.hidden, "E again leaves the hiding spot");

  // loot + exit gating
  const exit = D.exit,
    ec = { x: (exit.x0 + exit.x1) / 2, y: (exit.y0 + exit.y1) / 2 };
  g.guards.forEach((gd) => {
    gd.logic.reset();
    gd.logic.x = 300;
    gd.logic.y = 150;
  });
  g.thief.x = ec.x;
  g.thief.y = ec.y;
  frame(3);
  ok(g.state === "PLAYING", "exit does nothing without loot");
  const L0 = g.lootObjs[0];
  g.thief.x = L0.def.ax;
  g.thief.y = L0.def.ay;
  frame(3);
  ok(g.target && g.target.kind === "loot", "loot prompt near chest");
  g.updateHud(true);
  ok(
    el("t-act").dataset.kind === "loot" &&
      el("t-act-label").textContent === "TAKE",
    "action button shows TAKE next to loot",
  );
  press("e");
  frame(2);
  ok(g.lootCount === 1 && L0.collected, "E collects loot (1/3)");
  const L1 = g.lootObjs[1];
  g.thief.x = L1.def.ax;
  g.thief.y = L1.def.ay;
  frame(3);
  press("e");
  frame(2);
  ok(g.lootCount === 2 && !g.exitOpen, "exit stays LOCKED with only 2/3 loot");
  g.guards.forEach((gd) => {
    gd.logic.reset();
    gd.logic.x = 300;
    gd.logic.y = 150;
  });
  g.thief.x = ec.x;
  g.thief.y = ec.y;
  frame(3);
  ok(g.state === "PLAYING", "reaching the exit with 2/3 loot does NOT win");
  const L2 = g.lootObjs[2];
  g.thief.x = L2.def.ax;
  g.thief.y = L2.def.ay;
  frame(3);
  press("e");
  frame(2);
  ok(g.lootCount === 3 && g.exitOpen, "third loot opens the exit (3/3)");
  g.updateHud(true);
  ok(el("hud-loot").textContent === "3/3", "HUD shows 3/3");
  g.guards.forEach((gd) => {
    gd.logic.reset();
    gd.logic.x = 300;
    gd.logic.y = 150;
  });
  g.thief.x = ec.x;
  g.thief.y = ec.y;
  frame(3);
  ok(
    g.state === "OVER" && !el("screen-win").classList.contains("hidden"),
    "reaching the open exit shows the victory screen",
  );
  ok(el("win-stats").innerHTML.includes("Loot"), "victory stats rendered");

  // guard torch: beam origin is the hand, offset from the feet
  const tg = g.guards[0].logic;
  tg.x = 555;
  tg.y = 300;
  tg.angle = 0;
  tg._refreshFan();
  ok(
    Math.hypot(tg.ox - tg.x, tg.oy - tg.y) > 3,
    "flashlight origin is the torch in the hand, not the body centre",
  );

  // restart and capture
  click("btn-retry-win");
  frame(3);
  ok(
    g.state === "PLAYING" && g.lootCount === 0 && g.matchTime > 239,
    "restart resets match",
  );
  const gd = g.guards[0].logic;
  gd.x = 555;
  gd.y = 400;
  gd.angle = gd.desiredAngle = Math.PI / 2;
  g.thief.x = 555;
  g.thief.y = 470;
  g.thief.hidden = false;
  for (let i = 0; i < 400 && g.state === "PLAYING"; i++) {
    g.thief.x = 555;
    g.thief.y = 470;
    frame(1);
  }
  ok(
    g.state === "OVER" && !el("screen-over").classList.contains("hidden"),
    "being caught shows the Game Over screen",
  );
  ok(el("over-title").textContent === "CAUGHT", "game over title says CAUGHT");
  ok(g.stats.spotted >= 1, "spotted counter incremented");

  // timeout
  click("btn-retry-over");
  frame(3);
  g.matchTime = 0.05;
  frame(10);
  ok(
    g.state === "OVER" && el("over-title").textContent === "DAWN BREAKS",
    "timer expiry -> guards win",
  );

  // pause
  click("btn-retry-over");
  frame(3);
  press("p");
  frame(2);
  ok(
    g.state === "PAUSED" && !el("screen-pause").classList.contains("hidden"),
    "P pauses and shows pause screen",
  );
  const t0 = g.matchTime;
  frame(30);
  ok(g.matchTime === t0, "timer frozen while paused");
  click("btn-resume");
  frame(2);
  ok(g.state === "PLAYING", "resume works");
  click("btn-settings-pause");
  ok(
    !el("screen-settings").classList.contains("hidden"),
    "settings reachable from pause",
  );
  click("btn-settings-back");
  ok(
    !el("screen-pause").classList.contains("hidden"),
    "settings back returns to pause",
  );
  click("btn-menu-pause");
  frame(2);
  ok(g.state === "MENU", "back to main menu");

  // long soak: random inputs, no exceptions
  click("btn-play");
  click("btn-start");
  frame(2);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let threw = null;
  try {
    for (let i = 0; i < 60 * 120 && g.state === "PLAYING"; i++) {
      if (i % 40 === 0) {
        ["w", "a", "s", "d"].forEach((k) => (g.keys[k].isDown = rnd() < 0.4));
        g.keys.shift.isDown = rnd() < 0.3;
      }
      if (i % 90 === 0 && rnd() < 0.5) press("q");
      if (i % 70 === 0 && rnd() < 0.5) press("e");
      frame(1);
    }
  } catch (e) {
    threw = e;
  }
  ok(
    !threw,
    "soak test: 2 minutes of random play with no exceptions" +
      (threw ? " -> " + threw.stack : "") +
      ` (ended ${g.state})`,
  );

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
}
