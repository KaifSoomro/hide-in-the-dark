(function (root) {
  "use strict";

  const CELL = 8; // fine collision cell size (map pixels)
  const TAU = Math.PI * 2;
  const FOOT_HX = 7,
    FOOT_HY = 5; // half extents of a character's footprint

  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  const normAngle = (a) => {
    a %= TAU;
    if (a > Math.PI) a -= TAU;
    else if (a < -Math.PI) a += TAU;
    return a;
  };
  const angleDiff = (a, b) => normAngle(b - a);
  const turnToward = (cur, target, maxStep) => {
    const d = angleDiff(cur, target);
    if (Math.abs(d) <= maxStep) return target;
    return normAngle(cur + Math.sign(d) * maxStep);
  };

  /* --------------------------------------------------------------------------
   * World / collision grid
   * ------------------------------------------------------------------------ */
  class World {
    constructor(data) {
      this.W = data.W;
      this.H = data.H;
      this.cols = Math.ceil(this.W / CELL);
      this.rows = Math.ceil(this.H / CELL);
      this.walk = new Uint8Array(this.cols * this.rows);
      this.solid = new Uint8Array(this.cols * this.rows).fill(1); // everything is wall by default
      this._build(data);
    }

    _build(data) {
      const { cols, rows } = this;
      // 1. floors are walkable and see-through
      for (const f of data.floors) {
        const x0 = Math.max(0, Math.floor(f[0] / CELL)),
          x1 = Math.min(cols - 1, Math.floor(f[2] / CELL));
        const y0 = Math.max(0, Math.floor(f[1] / CELL)),
          y1 = Math.min(rows - 1, Math.floor(f[3] / CELL));
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            this.walk[y * cols + x] = 1;
            this.solid[y * cols + x] = 0;
          }
      }
      // 2. furniture / wall blocks carve out of the floor
      for (const b of data.blocks) {
        if (b[0] === "e") {
          // ellipse: ['e', cx, cy, rx, ry, blocksSight]
          const [, cx, cy, rx, ry, los] = b;
          const x0 = Math.max(0, Math.floor((cx - rx) / CELL)),
            x1 = Math.min(cols - 1, Math.floor((cx + rx) / CELL));
          const y0 = Math.max(0, Math.floor((cy - ry) / CELL)),
            y1 = Math.min(rows - 1, Math.floor((cy + ry) / CELL));
          for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
              const px = (x + 0.5) * CELL,
                py = (y + 0.5) * CELL;
              if (((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1) {
                this.walk[y * cols + x] = 0;
                if (los) this.solid[y * cols + x] = 1;
              }
            }
        } else {
          // rect: [x0, y0, x1, y1, blocksSight]
          const [bx0, by0, bx1, by1, los] = b;
          const x0 = Math.max(0, Math.floor(bx0 / CELL)),
            x1 = Math.min(cols - 1, Math.floor(bx1 / CELL));
          const y0 = Math.max(0, Math.floor(by0 / CELL)),
            y1 = Math.min(rows - 1, Math.floor(by1 / CELL));
          for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
              this.walk[y * cols + x] = 0;
              if (los) this.solid[y * cols + x] = 1;
            }
        }
      }
    }

    isWalkable(x, y) {
      const cx = (x / CELL) | 0,
        cy = (y / CELL) | 0;
      if (x < 0 || y < 0 || cx >= this.cols || cy >= this.rows) return false;
      return this.walk[cy * this.cols + cx] === 1;
    }
    isSolid(x, y) {
      const cx = (x / CELL) | 0,
        cy = (y / CELL) | 0;
      if (x < 0 || y < 0 || cx >= this.cols || cy >= this.rows) return true;
      return this.solid[cy * this.cols + cx] === 1;
    }
    /** can a character with a small rectangular footprint stand at x,y ? */
    canStand(x, y) {
      return (
        this.isWalkable(x - FOOT_HX, y - FOOT_HY) &&
        this.isWalkable(x + FOOT_HX, y - FOOT_HY) &&
        this.isWalkable(x - FOOT_HX, y + FOOT_HY) &&
        this.isWalkable(x + FOOT_HX, y + FOOT_HY)
      );
    }

    /** Move an entity (anything with x,y) with axis-separated sliding collision. Returns true if it moved at all. */
    moveEntity(e, dx, dy) {
      const total = Math.hypot(dx, dy);
      if (total === 0) return false;
      const steps = Math.max(1, Math.ceil(total / 4)); // sub-step so fast movers never tunnel through thin walls
      const sx = dx / steps,
        sy = dy / steps;
      let moved = false;
      for (let i = 0; i < steps; i++) {
        if (this.canStand(e.x + sx, e.y + sy)) {
          e.x += sx;
          e.y += sy;
          moved = true;
        } else if (sx !== 0 && this.canStand(e.x + sx, e.y)) {
          e.x += sx;
          moved = true;
        } else if (sy !== 0 && this.canStand(e.x, e.y + sy)) {
          e.y += sy;
          moved = true;
        } else break;
      }
      return moved;
    }

    /** Line of sight: marches along the segment; any sight-blocking cell stops it. */
    hasLOS(x0, y0, x1, y1) {
      const dx = x1 - x0,
        dy = y1 - y0;
      const d = Math.hypot(dx, dy);
      if (d < 2) return true;
      const steps = Math.ceil(d / 4);
      const ux = dx / steps,
        uy = dy / steps;
      let x = x0,
        y = y0;
      for (let i = 1; i < steps; i++) {
        // skip endpoints: entities may hug walls
        x += ux;
        y += uy;
        if (this.isSolid(x, y)) return false;
      }
      return true;
    }

    /** Like hasLOS but for walking: is a straight walk free of obstacles (uses the footprint)? */
    walkClear(x0, y0, x1, y1) {
      const dx = x1 - x0,
        dy = y1 - y0;
      const d = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(d / 5));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (!this.canStand(x0 + dx * t, y0 + dy * t)) return false;
      }
      return true;
    }

    /**
     * Cast a fan of rays forming the flashlight's visible polygon.
     * Walls shorten each ray, so the beam is cut off by geometry exactly like a real flashlight.
     * Writes n+1 points into outX / outY (typed arrays) and returns the number of points.
     */
    castFan(ox, oy, angle, half, range, n, outX, outY) {
      const step = 5;
      for (let i = 0; i <= n; i++) {
        const a = angle - half + (2 * half * i) / n;
        const ca = Math.cos(a),
          sa = Math.sin(a);
        let d = 0;
        while (d < range) {
          const nd = Math.min(range, d + step);
          if (this.isSolid(ox + ca * nd, oy + sa * nd)) break;
          d = nd;
        }
        // refine the last step for a crisp edge
        outX[i] = ox + ca * d;
        outY[i] = oy + sa * d;
      }
      return n + 1;
    }
  }

  /* --------------------------------------------------------------------------
   * Navigation: coarse grid A* with line-of-walk smoothing
   * ------------------------------------------------------------------------ */
  const NAV = 12;
  class NavMesh {
    constructor(world) {
      this.world = world;
      this.cols = Math.ceil(world.W / NAV);
      this.rows = Math.ceil(world.H / NAV);
      const n = this.cols * this.rows;
      this.ok = new Uint8Array(n);
      for (let j = 0; j < this.rows; j++)
        for (let i = 0; i < this.cols; i++) {
          const cx = i * NAV + NAV / 2,
            cy = j * NAV + NAV / 2;
          let good = true;
          for (let oy = -8; oy <= 8 && good; oy += 8)
            for (let ox = -8; ox <= 8; ox += 8) {
              if (!world.isWalkable(cx + ox, cy + oy)) {
                good = false;
                break;
              }
            }
          this.ok[j * this.cols + i] = good ? 1 : 0;
        }
      this.g = new Float32Array(n);
      this.parent = new Int32Array(n);
      this.stamp = new Int32Array(n);
      this.closed = new Int32Array(n);
      this.gen = 0;
      this.heap = []; // reused binary heap of [f, idx]
      this._scratch = [];
    }

    cellOf(x, y) {
      return {
        i: Math.min(this.cols - 1, Math.max(0, (x / NAV) | 0)),
        j: Math.min(this.rows - 1, Math.max(0, (y / NAV) | 0)),
      };
    }

    /** nearest navigable cell index around a world point (ring search) or -1 */
    snap(x, y) {
      const c = this.cellOf(x, y);
      if (this.ok[c.j * this.cols + c.i]) return c.j * this.cols + c.i;
      for (let r = 1; r <= 8; r++) {
        let best = -1,
          bd = 1e9;
        for (let dj = -r; dj <= r; dj++)
          for (let di = -r; di <= r; di++) {
            if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
            const i = c.i + di,
              j = c.j + dj;
            if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) continue;
            if (!this.ok[j * this.cols + i]) continue;
            const d = (i - c.i) ** 2 + (j - c.j) ** 2;
            if (d < bd) {
              bd = d;
              best = j * this.cols + i;
            }
          }
        if (best >= 0) return best;
      }
      return -1;
    }
    centerOf(idx) {
      return {
        x: (idx % this.cols) * NAV + NAV / 2,
        y: ((idx / this.cols) | 0) * NAV + NAV / 2,
      };
    }

    // --- tiny binary min-heap (arrays of f and idx) ---
    _push(f, idx) {
      const h = this.heap;
      h.push(f, idx);
      let i = (h.length >> 1) - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (h[p * 2] <= h[i * 2]) break;
        const tf = h[p * 2],
          ti = h[p * 2 + 1];
        h[p * 2] = h[i * 2];
        h[p * 2 + 1] = h[i * 2 + 1];
        h[i * 2] = tf;
        h[i * 2 + 1] = ti;
        i = p;
      }
    }
    _pop() {
      const h = this.heap;
      const idx = h[1];
      const lf = h.pop(),
        li = h.pop();
      if (h.length) {
        h[0] = lf;
        h[1] = li;
        let i = 0;
        const n = h.length >> 1;
        for (;;) {
          let l = i * 2 + 1,
            r = l + 1,
            m = i;
          if (l < n && h[l * 2] < h[m * 2]) m = l;
          if (r < n && h[r * 2] < h[m * 2]) m = r;
          if (m === i) break;
          const tf = h[m * 2],
            ti = h[m * 2 + 1];
          h[m * 2] = h[i * 2];
          h[m * 2 + 1] = h[i * 2 + 1];
          h[i * 2] = tf;
          h[i * 2 + 1] = ti;
          i = m;
        }
      }
      return idx;
    }

    /** Find a path (array of {x,y}) from (sx,sy) to (tx,ty). Returns [] if unreachable. */
    findPath(sx, sy, tx, ty) {
      const w = this.world;
      const s = this.snap(sx, sy),
        t = this.snap(tx, ty);
      if (s < 0 || t < 0) return [];
      if (w.walkClear(sx, sy, tx, ty)) return [{ x: tx, y: ty }]; // trivial case

      const gen = ++this.gen,
        cols = this.cols;
      this.heap.length = 0;
      const tj = (t / cols) | 0,
        ti = t % cols;
      this.g[s] = 0;
      this.stamp[s] = gen;
      this.parent[s] = -1;
      this._push(0, s);
      let found = false;
      const SQ2 = 1.41421356;
      while (this.heap.length) {
        const cur = this._pop();
        if (this.closed[cur] === gen) continue;
        this.closed[cur] = gen;
        if (cur === t) {
          found = true;
          break;
        }
        const cj = (cur / cols) | 0,
          ci = cur % cols;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const ni = ci + di,
              nj = cj + dj;
            if (ni < 0 || nj < 0 || ni >= cols || nj >= this.rows) continue;
            const n = nj * cols + ni;
            if (!this.ok[n] || this.closed[n] === gen) continue;
            if (
              di &&
              dj &&
              (!this.ok[cj * cols + ni] || !this.ok[nj * cols + ci])
            )
              continue; // no corner cutting
            const ng = this.g[cur] + (di && dj ? SQ2 : 1);
            if (this.stamp[n] !== gen || ng < this.g[n]) {
              this.stamp[n] = gen;
              this.g[n] = ng;
              this.parent[n] = cur;
              const dx = Math.abs(ni - ti),
                dy = Math.abs(nj - tj);
              this._push(ng + (dx + dy) + (SQ2 - 2) * Math.min(dx, dy), n);
            }
          }
      }
      if (!found) return [];
      // rebuild
      const raw = [];
      for (let c = t; c !== -1; c = this.parent[c]) raw.push(this.centerOf(c));
      raw.reverse();
      raw[0] = { x: sx, y: sy };
      raw[raw.length - 1] = this.world.canStand(tx, ty)
        ? { x: tx, y: ty }
        : raw[raw.length - 1];
      // string pulling: keep only waypoints needed to avoid obstacles
      const out = [];
      let anchor = 0;
      while (anchor < raw.length - 1) {
        let far = anchor + 1;
        for (let k = raw.length - 1; k > anchor + 1; k--) {
          if (w.walkClear(raw[anchor].x, raw[anchor].y, raw[k].x, raw[k].y)) {
            far = k;
            break;
          }
        }
        out.push({ x: raw[far].x, y: raw[far].y });
        anchor = far;
      }
      return out;
    }

    /** random navigable point around (cx,cy) within [rMin,rMax]; null if none found quickly */
    randomPointNear(cx, cy, rMin, rMax, rng) {
      for (let k = 0; k < 14; k++) {
        const a = rng() * TAU,
          r = rMin + rng() * (rMax - rMin);
        const x = cx + Math.cos(a) * r,
          y = cy + Math.sin(a) * r;
        const s = this.snap(x, y);
        if (s < 0) continue;
        const c = this.centerOf(s);
        if (
          dist(c.x, c.y, cx, cy) < rMax + 24 &&
          this.world.hasLOS(cx, cy, c.x, c.y)
        )
          return c;
      }
      return null;
    }
  }

  /* --------------------------------------------------------------------------
   * Sound system
   * Each event: { type, x, y, radius, intensity, age, life }
   * Guards decide for themselves whether they hear it (distance + wall attenuation).
   * ------------------------------------------------------------------------ */
  const SOUND_TYPES = {
    walk: { radius: 60, intensity: 0.2, life: 0.5 }, // low
    run: { radius: 150, intensity: 0.45, life: 0.7 }, // medium
    wood: { radius: 130, intensity: 0.4, life: 0.8 }, // creaky floorboards
    door: { radius: 90, intensity: 0.35, life: 0.8 }, // door opening
    loot: { radius: 100, intensity: 0.4, life: 0.7 }, // coin jingle
    whistle: { radius: 290, intensity: 0.7, life: 1.2 }, // medium-high
    metal: { radius: 250, intensity: 0.85, life: 1.2 }, // high
    glass: { radius: 270, intensity: 0.9, life: 1.3 }, // high
    slam: { radius: 340, intensity: 1.0, life: 1.5 }, // very high
  };

  class SoundSystem {
    constructor() {
      this.events = [];
      this.listeners = [];
      this.pool = [];
    }
    onEmit(fn) {
      this.listeners.push(fn);
    }
    emit(type, x, y) {
      const def = SOUND_TYPES[type];
      const ev = this.pool.pop() || {};
      ev.type = type;
      ev.x = x;
      ev.y = y;
      ev.radius = def.radius;
      ev.intensity = def.intensity;
      ev.age = 0;
      ev.life = def.life;
      this.events.push(ev);
      for (const l of this.listeners) l(ev);
      return ev;
    }
    update(dt) {
      for (let i = this.events.length - 1; i >= 0; i--) {
        const e = this.events[i];
        e.age += dt;
        if (e.age >= e.life) {
          this.pool.push(e);
          this.events.splice(i, 1);
        }
      }
    }
    clear() {
      for (const e of this.events) this.pool.push(e);
      this.events.length = 0;
    }
  }

  /* --------------------------------------------------------------------------
   * Guard AI
   * ------------------------------------------------------------------------ */
  const S = {
    PATROL: "PATROL",
    INVESTIGATE: "INVESTIGATE",
    SEARCH: "SEARCH",
    CHASE: "CHASE",
    CAPTURE: "CAPTURE",
  };
  const CAPTURE_DIST = 24;

  class Guard {
    /**
     * @param {string} id
     * @param {Array<[number,number]>} route patrol waypoints
     * @param {{x:number,y:number}} start
     * @param {object} env shared services: { world, nav, hideSpots, thief, rng, onEvent(name, guard, extra) }
     */
    constructor(id, route, start, env) {
      this.id = id;
      this.route = route;
      this.env = env;
      this.startX = start.x;
      this.startY = start.y;
      // flashlight parameters (adjustable per guard / per state)
      this.beamRange = 240;
      this.beamHalf = 0.5;
      this.fanX = new Float32Array(41);
      this.fanY = new Float32Array(41);
      this.fanN = 0;
      this.reset();
    }

    reset() {
      this.x = this.startX;
      this.y = this.startY;
      this.angle = Math.PI / 2;
      this.desiredAngle = this.angle;
      this.state = S.PATROL;
      this.prevState = S.PATROL;
      this.wp = 0;
      this.path = null;
      this.pathIdx = 0;
      this.dwell = 0.8;
      this.dwellBase = this.angle;
      this.suspicion = 0;
      this.canSee = false;
      this.lastKnownX = 0;
      this.lastKnownY = 0;
      this.loseTimer = 0;
      this.repathTimer = 0;
      this.soundPriority = 0;
      this.soundX = 0;
      this.soundY = 0;
      this.searchPoints = [];
      this.searchIdx = 0;
      this.searchTimer = 0;
      this.searchPhase = "center";
      this.stuckTimer = 0;
      this.lastPX = this.x;
      this.lastPY = this.y;
      this.moving = false;
      this.speed = 0;
      this.t = Math.random() * 10;
      this.inspected = null;
      this.ox = this.x;
      this.oy = this.y;
      this._updateOrigin();
    }

    get label() {
      return this.state;
    }

    /* ---- perception ---- */
    /** The flashlight lives in the guard's hand: a point in front of the body, at hip height.
     *  If that point would poke into a wall, fall back to the feet so the beam never starts inside geometry. */
    _updateOrigin() {
      const hx = this.x + Math.cos(this.angle) * 11,
        hy = this.y - 10 + Math.sin(this.angle) * 5;
      const w = this.env.world;
      if (
        !w.isSolid(hx, hy) &&
        !w.isSolid((hx + this.x) / 2, (hy + this.y) / 2)
      ) {
        this.ox = hx;
        this.oy = hy;
      } else {
        this.ox = this.x;
        this.oy = this.y;
      }
    }

    inBeam(px, py) {
      const dx = px - this.ox,
        dy = py - this.oy;
      const d = Math.hypot(dx, dy);
      if (d > this.beamRange) return false;
      if (d > 6) {
        // inside the cone?
        if (Math.abs(angleDiff(this.angle, Math.atan2(dy, dx))) > this.beamHalf)
          return false;
      }
      return this.env.world.hasLOS(this.ox, this.oy, px, py); // walls & solid cover block the beam
    }

    /** React to a sound event. Returns true if the guard heard (and will investigate) it. */
    hear(ev) {
      if (this.state === S.CHASE || this.state === S.CAPTURE) return false;
      const d = dist(this.x, this.y, ev.x, ev.y);
      const eff = this.env.world.hasLOS(this.x, this.y, ev.x, ev.y)
        ? d
        : d * 1.5; // walls muffle sound
      if (eff > ev.radius) return false;
      // only a rough idea of where it came from; louder + closer = more precise
      const err = Math.min(70, 10 + d * 0.16);
      const rng = this.env.rng;
      let tx = ev.x + (rng() - 0.5) * 2 * err,
        ty = ev.y + (rng() - 0.5) * 2 * err;
      const s = this.env.nav.snap(tx, ty);
      if (s < 0) return false;
      const c = this.env.nav.centerOf(s);
      tx = c.x;
      ty = c.y;
      if (
        this.state === S.INVESTIGATE &&
        this.soundPriority > ev.intensity + 0.05 &&
        dist(this.soundX, this.soundY, ev.x, ev.y) > 40
      )
        return false;
      this.soundX = tx;
      this.soundY = ty;
      this.soundPriority = ev.intensity;
      this._setState(S.INVESTIGATE);
      this._goTo(tx, ty);
      this.env.onEvent("heard", this, ev);
      return true;
    }

    /* ---- state helpers ---- */
    _setState(s) {
      if (this.state === s) return;
      this.prevState = this.state;
      this.state = s;
      this.stuckTimer = 0;
      switch (s) {
        case S.PATROL:
          this.beamRange = 240;
          this.beamHalf = 0.5;
          break;
        case S.INVESTIGATE:
          this.beamRange = 250;
          this.beamHalf = 0.5;
          break;
        case S.SEARCH:
          this.beamRange = 225;
          this.beamHalf = 0.62;
          break;
        case S.CHASE:
          this.beamRange = 290;
          this.beamHalf = 0.46;
          break;
        case S.CAPTURE:
          this.beamRange = 140;
          this.beamHalf = 0.7;
          break;
      }
    }
    _goTo(x, y) {
      this.path = this.env.nav.findPath(this.x, this.y, x, y);
      this.pathIdx = 0;
      this.stuckTimer = 0;
      this.repathTimer = 0.5;
      this.targetX = x;
      this.targetY = y;
    }
    /** advance along this.path; returns true when the destination has been reached */
    _follow(dt, speed) {
      this.moving = false;
      this.speed = 0;
      if (!this.path || this.pathIdx >= this.path.length) return true;
      const n = this.path[this.pathIdx];
      const dx = n.x - this.x,
        dy = n.y - this.y,
        d = Math.hypot(dx, dy);
      if (d < 4) {
        this.pathIdx++;
        return this.pathIdx >= this.path.length;
      }
      const step = Math.min(speed * dt, d);
      const moved = this.env.world.moveEntity(
        this,
        (dx / d) * step,
        (dy / d) * step,
      );
      this.desiredAngle = Math.atan2(dy, dx);
      this.moving = moved;
      this.speed = moved ? speed : 0;
      // stuck detection -> repath once, then give up on the node
      this.stuckTimer =
        moved &&
        dist(this.x, this.y, this.lastPX, this.lastPY) > 0.4 * speed * dt
          ? 0
          : this.stuckTimer + dt;
      this.lastPX = this.x;
      this.lastPY = this.y;
      if (this.stuckTimer > 0.7) {
        this.stuckTimer = 0;
        if (this.targetX !== undefined) this._goTo(this.targetX, this.targetY);
        if (!this.path.length) return true;
      }
      return false;
    }
    _scan(amp, rate) {
      this.desiredAngle = this.dwellBase + Math.sin(this.t * rate) * amp;
    }

    /* ---- main update ---- */
    update(dt) {
      const env = this.env,
        thief = env.thief,
        w = env.world;
      this.t += dt;
      if (this.state === S.CAPTURE) {
        this.moving = false;
        this.speed = 0;
        this._refreshFan();
        return;
      }

      /* 1. vision - ONLY inside the flashlight beam with clear line of sight */
      const seen = !thief.hidden && this.inBeam(thief.x, thief.y);
      this.canSee = seen;
      if (seen) {
        const d = dist(this.x, this.y, thief.x, thief.y);
        this.suspicion = Math.min(
          1,
          this.suspicion + dt * (d < 90 ? 4.5 : 2.4),
        );
        if (this.state !== S.CHASE) {
          this.lastKnownX = thief.x;
          this.lastKnownY = thief.y;
          if (this.suspicion >= 1) this._startChase();
        }
      } else {
        this.suspicion = Math.max(0, this.suspicion - dt * 0.55);
      }

      /* 2. behaviour */
      switch (this.state) {
        case S.PATROL:
          this._patrol(dt);
          break;
        case S.INVESTIGATE:
          this._investigate(dt);
          break;
        case S.SEARCH:
          this._search(dt);
          break;
        case S.CHASE:
          this._chase(dt, seen);
          break;
      }

      /* 2b. something is in the beam: keep the flashlight on it (overrides patrol / search sweeping) */
      if (seen && this.state !== S.CHASE)
        this.desiredAngle = Math.atan2(thief.y - this.oy, thief.x - this.ox);

      /* 3. flashlight turns smoothly towards desired direction */
      const rate = this.state === S.CHASE ? 7 : this.moving ? 4 : 2.6;
      this.angle = turnToward(this.angle, this.desiredAngle, rate * dt);
      this._refreshFan();
    }

    _refreshFan() {
      this._updateOrigin();
      this.fanN = this.env.world.castFan(
        this.ox,
        this.oy,
        this.angle,
        this.beamHalf,
        this.beamRange,
        40,
        this.fanX,
        this.fanY,
      );
    }

    _startChase() {
      const thief = this.env.thief;
      this._setState(S.CHASE);
      this.lastKnownX = thief.x;
      this.lastKnownY = thief.y;
      this.loseTimer = 0;
      this.repathTimer = 0;
      this.path = null;
      this.env.onEvent("alert", this);
    }

    _patrol(dt) {
      if (this.dwell > 0) {
        // pause at waypoint, sweeping the flashlight
        this.dwell -= dt;
        this.moving = false;
        this.speed = 0;
        this._scan(0.9, 1.5);
        if (this.dwell <= 0) {
          this.wp = (this.wp + 1) % this.route.length;
          this.path = null;
        }
        return;
      }
      if (!this.path) {
        const r = this.route[this.wp];
        this._goTo(r[0], r[1]);
      }
      if (this.suspicion > 0.25) {
        this.moving = false;
        this.speed = 0;
        return;
      } // freeze while something looks suspicious
      if (this._follow(dt, 62)) {
        this.dwell = 0.7 + this.env.rng() * 1.3;
        this.dwellBase = this.angle;
        this.path = null;
        const r = this.route[this.wp];
        if (dist(this.x, this.y, r[0], r[1]) > 40) {
          // could not reach this waypoint -> move on
          this.wp = (this.wp + 1) % this.route.length;
          this.dwell = 0;
        }
      }
    }

    _investigate(dt) {
      if (this.suspicion > 0.25) {
        this.moving = false;
        this.speed = 0;
        return;
      }
      if (this._follow(dt, 92))
        this._enterSearch(this.soundX, this.soundY, false);
    }

    /** Begin searching around a point: look around, then visit nearby hiding spots. */
    _enterSearch(cx, cy, fromChase) {
      this._setState(S.SEARCH);
      this.searchCenterX = cx;
      this.searchCenterY = cy;
      this.fromChase = fromChase;
      this.searchPoints.length = 0;
      this.searchIdx = 0;
      this.searchPhase = "center";
      this.searchTimer = fromChase ? 3.2 : 2.2;
      this.searchTotal = 0;
      this.dwellBase = this.angle;
      this.path = null;
      // nearby hiding spots are checked first, then a few random corners
      const spots = this.env.hideSpots
        .map((h) => ({ h, d: dist(h.x, h.y, cx, cy) }))
        .filter((o) => o.d < (fromChase ? 260 : 190))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
      for (const o of spots)
        this.searchPoints.push({ x: o.h.ax, y: o.h.ay, spot: o.h });
      const extra = fromChase ? 2 : 1;
      for (let i = 0; i < extra; i++) {
        const p = this.env.nav.randomPointNear(cx, cy, 60, 160, this.env.rng);
        if (p) this.searchPoints.push({ x: p.x, y: p.y, spot: null });
      }
    }

    _search(dt) {
      this.searchTotal += dt;
      if (this.searchTotal > 22) return this._returnToPatrol();
      if (this.suspicion > 0.25) {
        this.moving = false;
        this.speed = 0;
        return;
      }
      if (this.searchPhase === "center") {
        // slow sweep with the flashlight
        this.moving = false;
        this.speed = 0;
        this._scan(1.25, 1.9);
        this.searchTimer -= dt;
        if (this.searchTimer <= 0) {
          this.searchPhase = "walk";
          this.path = null;
        }
        return;
      }
      if (this.searchIdx >= this.searchPoints.length)
        return this._returnToPatrol();
      const p = this.searchPoints[this.searchIdx];
      if (this.searchPhase === "walk") {
        if (!this.path) this._goTo(p.x, p.y);
        if (this._follow(dt, 66)) {
          this.searchPhase = "look";
          this.searchTimer = 1.4;
          this.dwellBase = this.angle;
          this._inspect(p);
        }
        return;
      }
      // 'look' phase: pause and sweep
      this.moving = false;
      this.speed = 0;
      this._scan(1.1, 2.4);
      this.searchTimer -= dt;
      if (this.searchTimer <= 0) {
        this.searchIdx++;
        this.searchPhase = "walk";
        this.path = null;
      }
    }

    /** Looking inside a hiding place: a hidden thief may be discovered (not guaranteed). */
    _inspect(p) {
      const thief = this.env.thief;
      let found = false;
      if (p.spot && thief.hidden && thief.hideSpotId === p.spot.id)
        found = this.env.rng() < (this.fromChase ? 0.8 : 0.55);
      this.env.onEvent("inspect", this, { spot: p.spot, found });
      if (found) this._capture();
    }

    _returnToPatrol() {
      this._setState(S.PATROL);
      // resume at the nearest waypoint
      let best = 0,
        bd = 1e9;
      for (let i = 0; i < this.route.length; i++) {
        const d = dist(this.x, this.y, this.route[i][0], this.route[i][1]);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      this.wp = best;
      this.path = null;
      this.dwell = 0.4;
      this.soundPriority = 0;
      this.env.onEvent("calm", this);
    }

    _chase(dt, seen) {
      const thief = this.env.thief,
        w = this.env.world;
      if (seen) {
        this.lastKnownX = thief.x;
        this.lastKnownY = thief.y;
        this.loseTimer = 0;
      } else this.loseTimer += dt;

      const dT = dist(this.x, this.y, thief.x, thief.y);
      if (
        !thief.hidden &&
        dT < CAPTURE_DIST &&
        w.hasLOS(this.x, this.y, thief.x, thief.y)
      )
        return this._capture();

      const speed = 150;
      // straight at the thief when the way is open, otherwise A* to the last seen position
      if (seen && w.walkClear(this.x, this.y, thief.x, thief.y)) {
        this.path = [{ x: thief.x, y: thief.y }];
        this.pathIdx = 0;
        this.targetX = thief.x;
        this.targetY = thief.y;
      } else {
        this.repathTimer -= dt;
        if (!this.path || this.repathTimer <= 0) {
          this.repathTimer = 0.35;
          if (
            !this.path ||
            dist(this.targetX, this.targetY, this.lastKnownX, this.lastKnownY) >
              24 ||
            this.pathIdx >= this.path.length
          )
            this._goTo(this.lastKnownX, this.lastKnownY);
        }
      }
      const arrived = this._follow(dt, speed);
      if (!seen && (arrived || this.loseTimer > 9)) {
        this.env.onEvent("lost", this);
        this._enterSearch(this.lastKnownX, this.lastKnownY, true);
      }
    }

    _capture() {
      this._setState(S.CAPTURE);
      this.moving = false;
      this.speed = 0;
      this.env.onEvent("capture", this);
    }
  }

  const API = {
    CELL,
    NAV,
    World,
    NavMesh,
    SoundSystem,
    SOUND_TYPES,
    Guard,
    GUARD_STATES: S,
    dist,
    angleDiff,
    normAngle,
    CAPTURE_DIST,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.StealthLogic = API;
})(typeof window !== "undefined" ? window : globalThis);
