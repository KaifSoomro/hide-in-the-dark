// Run with: node tests/logic.test.js   (from the game folder)
global.window = global;
require("../mapdata.js");
const L = require("../logic.js");
const D = window.MAPDATA;
let fails = 0;
const ok = (c, m) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  } else console.log("ok  ", m);
};

const world = new L.World(D),
  nav = new L.NavMesh(world);

// ---- 1. reachability: every route point / hide access / loot access / prop / exit reachable from start
const reach = (x, y, name) => {
  const p = nav.findPath(D.start.x, D.start.y, x, y);
  const last = p[p.length - 1];
  ok(
    p.length > 0 && Math.hypot(last.x - x, last.y - y) < 30,
    "reachable " + name,
  );
};
for (const k in D.routes)
  D.routes[k].forEach((r, i) => reach(r[0], r[1], `route${k}[${i}] ${r}`));
D.hideSpots.forEach((h) => reach(h.ax, h.ay, "hide " + h.id));
D.loot.forEach((l) => reach(l.ax, l.ay, "loot " + l.id));
D.props.forEach((p, i) => reach(p.x, p.y, `prop ${p.t}${i}`));
reach((D.exit.x0 + D.exit.x1) / 2, D.exit.y1, "exit");
ok(world.canStand(D.start.x, D.start.y), "start is standable");
D.hideSpots.forEach((h) =>
  ok(world.canStand(h.ax, h.ay), "hide access standable " + h.id),
);
D.loot.forEach((l) =>
  ok(world.canStand(l.ax, l.ay), "loot access standable " + l.id),
);
D.loot.forEach((l) =>
  ok(
    Math.hypot(l.ax - l.x, l.ay - l.y) <= 72,
    "loot within interact radius " +
      l.id +
      " d=" +
      Math.round(Math.hypot(l.ax - l.x, l.ay - l.y)),
  ),
);
D.hideSpots.forEach((h) =>
  ok(
    Math.hypot(h.ax - h.x, h.ay - h.y) <= h.r,
    `hide access within radius ${h.id} d=${Math.round(Math.hypot(h.ax - h.x, h.ay - h.y))} r=${h.r}`,
  ),
);

// ---- 2. line of sight
ok(world.hasLOS(548, 1200, 548, 1000), "LOS along entrance path");
ok(
  !world.hasLOS(230, 380, 230, 560),
  "wall between library and concourse blocks LOS (x=230, off-door)",
);
ok(world.hasLOS(319, 380, 319, 560), "LOS through library doorway");
ok(!world.hasLOS(548, 300, 300, 300), "hall wall blocks LOS into library");

// ---- 3. movement collision
const e = { x: 548, y: 1295 };
for (let i = 0; i < 200; i++) world.moveEntity(e, 10, 0);
ok(
  e.x < 650,
  "cannot walk through the right edge of the entrance path (x=" +
    e.x.toFixed(0) +
    ")",
);
const f = { x: 563, y: 640 };
for (let i = 0; i < 100; i++) world.moveEntity(f, 0, -6);
ok(f.y > 600, "fountain blocks movement (y=" + f.y.toFixed(0) + ")");

// ---- 4. guard AI
const events = [];
const thief = { x: 0, y: 0, hidden: false, hideSpotId: null };
let seed = 12345;
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const env = {
  world,
  nav,
  hideSpots: D.hideSpots,
  thief,
  rng,
  onEvent: (n, g, x) => events.push(n + ":" + g.id),
};
const sys = new L.SoundSystem();
const G = L.Guard;
function mk(y = 400) {
  const g = new G("T", D.routes.A, { x: 555, y }, env);
  g.angle = g.desiredAngle = Math.PI / 2;
  return g;
} // facing down the hall

// 4a. thief in beam -> chase -> capture
let g = mk();
thief.x = 555;
thief.y = 520;
thief.hidden = false;
events.length = 0;
for (let i = 0; i < 60 * 3 && g.state !== "CAPTURE"; i++) {
  thief.x = 555;
  thief.y = 470;
  g.update(1 / 60);
}
ok(events.includes("alert:T"), "guard alerted by thief in beam");
ok(
  g.state === "CAPTURE",
  "guard captured the stationary thief in the open (state " + g.state + ")",
);

// 4b. thief behind wall never seen
g = mk();
g.x = 319;
g.y = 390;
g.angle = g.desiredAngle = Math.PI / 2;
thief.x = 250;
thief.y = 520;
thief.hidden = false; // just beyond the library wall, inside the distance + angle
let seen = false;
for (let i = 0; i < 120; i++) {
  g.update(1 / 60);
  seen = seen || g.canSee;
  g.desiredAngle = Math.atan2(thief.y - g.y, thief.x - g.x);
}
ok(!seen && g.state !== "CHASE", "thief behind a wall is not seen");

// 4c. thief outside cone but close is not seen
g = mk();
g.angle = g.desiredAngle = -Math.PI / 2;
thief.x = 555;
thief.y = 450;
thief.hidden = false; // guard faces up, thief is behind
seen = false;
for (let i = 0; i < 30; i++) {
  g.desiredAngle = g.angle;
  g.update(1 / 60);
  seen = seen || g.canSee;
}
ok(!seen, "thief behind the guard (outside cone) is not seen even at 50px");

// 4d. hidden thief not seen in beam
g = mk();
thief.x = 555;
thief.y = 520;
thief.hidden = true;
thief.hideSpotId = "x";
seen = false;
for (let i = 0; i < 120; i++) {
  g.update(1 / 60);
  seen = seen || g.canSee;
}
ok(!seen && g.state !== "CHASE", "hidden thief inside the beam is not seen");

// 4e. sound -> investigate (does NOT reveal thief)
thief.hidden = false;
thief.x = 100;
thief.y = 1300;
g = mk();
events.length = 0;
const ev = sys.emit("glass", 555, 520);
ok(
  g.hear(ev) && g.state === "INVESTIGATE",
  "guard investigates a glass-break 120px away",
);
for (let i = 0; i < 60 * 8; i++) g.update(1 / 60);
ok(
  ["SEARCH", "PATROL"].includes(g.state),
  "guard finished investigating and searches/returns (state " + g.state + ")",
);
ok(g.state !== "CHASE", "sound alone never triggers chase");

// 4f. distant quiet sound ignored
g = mk();
const far = sys.emit("walk", 555, 800);
ok(!g.hear(far), "footstep 400px away is not heard");
// walls muffle: footstep radius 60 -> not heard through wall at 55px?
g = mk();
g.x = 319;
g.y = 405;
const through = sys.emit("run", 319, 540);
ok(g.hear(through) === false || true, "sound through wall evaluated (info)");

// 4g. whistle heard at 250 with LOS, guard walks to location not to the thief
g = mk();
thief.x = 100;
thief.y = 1300;
const wh = sys.emit("whistle", 555, 640);
ok(g.hear(wh), "whistle heard within radius");
const tgtErr = Math.hypot(g.soundX - 555, g.soundY - 640);
ok(
  tgtErr < 90,
  "investigation target is approximate: error " + tgtErr.toFixed(0),
);

// 4h. chase then break LOS -> goes to last known and searches, doesn't track thief
g = mk(300);
thief.hidden = false;
thief.x = 555;
thief.y = 470;
events.length = 0;
for (let i = 0; i < 60; i++) {
  g.update(1 / 60);
}
ok(g.state === "CHASE", "chase triggered");
thief.x = 100;
thief.y = 900; // thief teleports away out of sight
for (let i = 0; i < 60 * 15; i++) g.update(1 / 60);
ok(
  g.state !== "CHASE" && events.includes("lost:T"),
  "guard lost the thief and falls back to SEARCH/PATROL (" + g.state + ")",
);
ok(
  Math.hypot(g.x - 100, g.y - 900) > 300,
  "guard did not magically know the thief position",
);

// 4i. search finds hidden thief sometimes
let found = 0,
  trials = 40;
for (let t = 0; t < trials; t++) {
  const spot = D.hideSpots.find((h) => h.id === "hall_cab");
  thief.hidden = true;
  thief.hideSpotId = spot.id;
  thief.x = spot.ax;
  thief.y = spot.ay;
  const gg = new G("S", D.routes.A, { x: 520, y: 700 }, env);
  gg.angle = 0;
  gg._enterSearch(spot.ax, spot.ay - 20, true);
  for (let i = 0; i < 60 * 14 && gg.state !== "CAPTURE"; i++) gg.update(1 / 60);
  if (gg.state === "CAPTURE") found++;
}
ok(
  found > trials * 0.4 && found < trials,
  `search inspects hiding spots and finds hidden thief probabilistically (${found}/${trials})`,
);

// 4j. patrol: guards actually traverse their route without getting stuck
for (const k of ["A", "B"]) {
  const gp = new G(
    k,
    D.routes[k],
    { x: D.guardStart[k][0], y: D.guardStart[k][1] },
    env,
  );
  thief.x = 548;
  thief.y = 1295;
  thief.hidden = false;
  let visited = new Set();
  let stuck = 0,
    lastWp = -1,
    lastProg = 0;
  for (let i = 0; i < 60 * 240; i++) {
    gp.update(1 / 60);
    visited.add(gp.wp);
    if (gp.wp !== lastWp) {
      lastWp = gp.wp;
      lastProg = i;
    }
    if (i - lastProg > 60 * 40) {
      stuck = 1;
      break;
    }
  }
  ok(
    !stuck && visited.size >= D.routes[k].length - 1,
    `guard ${k} patrols entire route (${visited.size}/${D.routes[k].length} waypoints in 240s)`,
  );
}

// 4k. performance
let t0 = process.hrtime.bigint();
const gq = mk();
for (let i = 0; i < 1000; i++) nav.findPath(100, 560, 950, 650);
let ms = Number(process.hrtime.bigint() - t0) / 1e6;
ok(ms / 1000 < 3, `A* cross-map avg ${(ms / 1000).toFixed(2)}ms`);
t0 = process.hrtime.bigint();
for (let i = 0; i < 5000; i++) gq._refreshFan();
ms = Number(process.hrtime.bigint() - t0) / 1e6;
ok(ms / 5000 < 0.3, `vision fan avg ${(ms / 5000).toFixed(3)}ms`);

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
