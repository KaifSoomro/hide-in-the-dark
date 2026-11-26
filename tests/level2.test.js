// Run with: node tests/level2.test.js (from the game folder)
global.window = global;
require("../level2data.js");
const L = require("../logic.js");
const D = window.LEVEL2_DATA;
let fails = 0;
const ok = (c, m) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  } else console.log("ok  ", m);
};

// 1. World + NavMesh with locked doors CLOSED initially
const world = new L.World(D);
const nav = new L.NavMesh(world);

ok(world.canStand(D.start.x, D.start.y), "L2 start is standable");
ok(!world.canStand(770, 434), "locked security door blocks standing while closed");
ok(!world.canStand(1290, 434), "locked vault door blocks standing while closed");
ok(!world.canStand(1450, 1152), "locked escape door blocks standing while closed");

// Unlock all doors and rebuild nav to test full map reachability
for (const ld of D.lockedDoors) {
  world.setRectBlocked(ld.x0, ld.y0, ld.x1, ld.y1, false);
  nav.rebuildArea(ld.x0, ld.y0, ld.x1, ld.y1);
}

const reach = (x, y, name) => {
  const p = nav.findPath(D.start.x, D.start.y, x, y);
  const last = p[p.length - 1];
  ok(p.length > 0 && Math.hypot(last.x - x, last.y - y) < 32, "L2 reachable " + name);
};

for (const k in D.routes) {
  D.routes[k].forEach((r, i) => reach(r[0], r[1], `route${k}[${i}]`));
}
D.hideSpots.forEach((h) => {
  ok(world.canStand(h.ax, h.ay), "L2 hide access standable " + h.id);
  ok(Math.hypot(h.ax - h.x, h.ay - h.y) <= h.r, "L2 hide within radius " + h.id);
  reach(h.ax, h.ay, "hide " + h.id);
});
D.loot.forEach((l) => {
  ok(world.canStand(l.ax, l.ay), "L2 loot access standable " + l.id);
  ok(Math.hypot(l.ax - l.x, l.ay - l.y) <= 72, "L2 loot within interact radius " + l.id);
  reach(l.ax, l.ay, "loot " + l.id);
});
D.keys.forEach((k) => {
  ok(world.canStand(k.ax, k.ay), "L2 key access standable " + k.id);
  ok(Math.hypot(k.ax - k.x, k.ay - k.y) <= 72, "L2 key within interact radius " + k.id);
  reach(k.ax, k.ay, "key " + k.id);
});
D.props.forEach((p, i) => reach(p.x, p.y, `prop ${p.t}${i}`));
reach((D.exit.x0 + D.exit.x1) / 2, (D.exit.y0 + D.exit.y1) / 2, "exit");

// 2. Guards A, B, C, D patrol without getting stuck
const thief = { x: D.start.x, y: D.start.y, hidden: false, hideSpotId: null };
let seed = 12345;
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const env = { world, nav, hideSpots: D.hideSpots, thief, rng, onEvent: () => {} };

for (const k of Object.keys(D.guardStart)) {
  const gp = new L.Guard(k, D.routes[k], { x: D.guardStart[k][0], y: D.guardStart[k][1] }, env);
  let visited = new Set();
  let stuck = 0, lastWp = -1, lastProg = 0;
  for (let i = 0; i < 60 * 240; i++) {
    gp.update(1 / 60);
    visited.add(gp.wp);
    if (gp.wp !== lastWp) { lastWp = gp.wp; lastProg = i; }
    if (i - lastProg > 60 * 40) { stuck = 1; break; }
  }
  ok(!stuck && visited.size >= D.routes[k].length - 1, `L2 guard ${k} patrols entire route (${visited.size}/${D.routes[k].length})`);
}

// 3. Security camera detection & LOS blocking
const camDef = D.cameras[0]; // checkpoint camera at (760, 618)
const cam = new L.SecurityCamera(camDef, world);
cam.angle = 0.8;
cam.pauseTimer = 10;
thief.hidden = false;
thief.x = 810; thief.y = 668; // in cone
ok(cam.update(1 / 60, thief) === true && cam.canSee, "camera detects thief inside cone");
thief.hidden = true;
cam.alertCd = 0;
ok(cam.update(1 / 60, thief) === false && !cam.canSee, "camera ignores hidden thief");
thief.hidden = false;
thief.x = 180; thief.y = 1340; // far away behind walls
cam.alertCd = 0;
ok(cam.update(1 / 60, thief) === false && !cam.canSee, "camera does not see through walls");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);

