/* =============================================================================
 * LEVEL 2: THE UNDERGROUND PRISON (1800 x 1500)
 * Organized separately from Level 1 (mapdata.js).
 * ========================================================================== */
window.LEVEL2_DATA = {
  id: 2,
  name: "Underground Prison",
  W: 1800,
  H: 1500,
  matchTime: 300, // 5 minutes for the larger prison map
  floors: [
    // 1. Underground Maintenance Room (Start - Bottom Left)
    [60, 1120, 340, 1420],
    // Connector Maintenance -> Cell Block A
    [160, 1060, 240, 1140],

    // 2. Cell Block A (Left Wing)
    [220, 520, 520, 1120], // Main Block A Hall
    // Cell A1 (top left)
    [60, 540, 180, 680],
    [170, 585, 230, 635], // doorway A1
    // Cell A2 (mid left)
    [60, 720, 180, 860],
    [170, 765, 230, 815], // doorway A2
    // Cell A3 (bottom left)
    [60, 900, 180, 1040],
    [170, 945, 230, 995], // doorway A3

    // 3. Ventilation Tunnels (Stealth routes)
    // Lower Vent: Maintenance Room -> Storage Room
    [330, 1200, 700, 1256],
    // Upper Vent: Cell Block A -> Security Corridor
    [380, 410, 440, 540],
    [380, 410, 640, 470],

    // 4. Main Prison Corridor & Central Security Checkpoint
    // Upper Main Corridor
    [500, 480, 1320, 620],
    // Lower Main Corridor
    [500, 780, 1320, 940],
    // Central Security Checkpoint (connects upper & lower corridors)
    [740, 600, 1060, 800],
    // West & East Vertical Connectors
    [500, 600, 600, 800],
    [1220, 600, 1320, 800],

    // 5. Security Control Room (Top Center-Left)
    [620, 140, 920, 410],
    [740, 400, 800, 495], // Doorway (Locked: Key 1)

    // 6. Storage Room (Bottom Center)
    [680, 1040, 1140, 1420],
    [860, 930, 940, 1050], // Connector from Lower Main Corridor

    // 7. Cell Block B (Right Wing)
    [1300, 520, 1580, 1120], // Main Block B Hall
    // Cell B1 (top right)
    [1620, 540, 1740, 680],
    [1570, 585, 1630, 635], // doorway B1
    // Cell B2 (mid right)
    [1620, 720, 1740, 860],
    [1570, 765, 1630, 815], // doorway B2
    // Cell B3 (bottom right)
    [1620, 900, 1740, 1040],
    [1570, 945, 1630, 995], // doorway B3

    // 8. Treasure Vault (Top Right)
    [1220, 140, 1680, 410],
    [1260, 400, 1320, 495], // Doorway (Locked: Key 2)

    // 9. Underground Escape Tunnel (Bottom Right)
    [1400, 1200, 1740, 1400],
    [1420, 1110, 1480, 1210], // Doorway from Cell Block B (Locked: Key 3)
  ],

  // [x0, y0, x1, y1, blocksSight]
  blocks: [
    // Maintenance Room crates & pipes
    [80, 1140, 140, 1210, 1],
    [260, 1310, 320, 1390, 0],

    // Cell Block A bunks & tables
    [75, 555, 125, 600, 0],
    [75, 735, 125, 780, 0],
    [75, 915, 125, 960, 0],
    [320, 640, 390, 700, 1], // Central pillar/crate stack A
    [320, 880, 390, 940, 1],

    // Central Security Checkpoint desks & pillars
    [820, 650, 980, 695, 0], // Checkpoint desk
    [760, 730, 805, 770, 1], // Pillar
    [995, 730, 1040, 770, 1], // Pillar

    // Security Control Room consoles
    [645, 175, 745, 225, 0],
    [800, 175, 895, 225, 0],
    [650, 290, 710, 340, 1],

    // Storage Room crates & barrels
    [720, 1090, 790, 1150, 1],
    [980, 1080, 1060, 1150, 1],
    [820, 1220, 900, 1290, 1],
    [1010, 1260, 1090, 1340, 0],

    // Cell Block B bunks & crates
    [1675, 555, 1725, 600, 0],
    [1675, 735, 1725, 780, 0],
    [1675, 915, 1725, 960, 0],
    [1400, 640, 1470, 700, 1],
    [1400, 880, 1470, 940, 1],

    // Treasure Vault pillars & tables
    [1310, 210, 1365, 265, 1],
    [1535, 210, 1590, 265, 1],
    [1420, 170, 1480, 210, 0],
  ],

  // Visual zones for procedural prison renderer (floors & labels-free decor)
  zones: [
    { name: "maintenance", x0: 60, y0: 1120, x1: 340, y1: 1420, style: "maintenance" },
    { name: "cellA", x0: 60, y0: 520, x1: 520, y1: 1120, style: "cells" },
    { name: "vent1", x0: 330, y0: 1200, x1: 700, y1: 1256, style: "vent" },
    { name: "vent2", x0: 380, y0: 410, x1: 640, y1: 470, style: "vent" },
    { name: "vent2b", x0: 380, y0: 410, x1: 440, y1: 540, style: "vent" },
    { name: "corridor", x0: 500, y0: 480, x1: 1320, y1: 940, style: "corridor" },
    { name: "checkpoint", x0: 740, y0: 600, x1: 1060, y1: 800, style: "checkpoint" },
    { name: "security", x0: 620, y0: 140, x1: 920, y1: 410, style: "security" },
    { name: "storage", x0: 680, y0: 1040, x1: 1140, y1: 1420, style: "storage" },
    { name: "cellB", x0: 1300, y0: 520, x1: 1740, y1: 1120, style: "cells" },
    { name: "vault", x0: 1220, y0: 140, x1: 1680, y1: 410, style: "vault" },
    { name: "escape", x0: 1400, y0: 1200, x1: 1740, y1: 1400, style: "escape" },
  ],

  // Metal prison bars (visual only, walls/blocks handle collision)
  bars: [
    [180, 540, 180, 585], [180, 635, 180, 680],
    [180, 720, 180, 765], [180, 815, 180, 860],
    [180, 900, 180, 945], [180, 995, 180, 1040],
    [1620, 540, 1620, 585], [1620, 635, 1620, 680],
    [1620, 720, 1620, 765], [1620, 815, 1620, 860],
    [1620, 900, 1620, 945], [1620, 995, 1620, 1040],
  ],

  hideSpots: [
    { id: "p_maint_barrels", name: "Metal Barrels", x: 290, y: 1350, ax: 242, ay: 1350, r: 64 },
    { id: "p_cell_a2", name: "Cell Bunk", x: 100, y: 758, ax: 145, ay: 790, r: 62 },
    { id: "p_block_a_crates", name: "Supply Crates", x: 355, y: 910, ax: 415, ay: 910, r: 68 },
    { id: "p_checkpoint_desk", name: "Security Desk", x: 900, y: 672, ax: 900, ay: 722, r: 64 },
    { id: "p_sec_console", name: "Control Console", x: 695, y: 200, ax: 695, ay: 252, r: 64 },
    { id: "p_storage_crates", name: "Storage Crates", x: 1050, y: 1300, ax: 990, ay: 1300, r: 68 },
    { id: "p_block_b_barrels", name: "Metal Barrels", x: 1435, y: 910, ax: 1375, ay: 910, r: 68 },
    { id: "p_cell_b2", name: "Cell Bunk", x: 1700, y: 758, ax: 1655, ay: 790, r: 62 },
  ],

  // 3 Hidden Treasures
  loot: [
    { id: "p_loot_sec", x: 860, y: 265, ax: 820, ay: 270, name: "Classified Ledger", sprite: "chest_library" },
    { id: "p_loot_store", x: 760, y: 1350, ax: 805, ay: 1350, name: "Contraband Stash", sprite: "chest_hall" },
    { id: "p_loot_vault", x: 1450, y: 235, ax: 1450, ay: 290, name: "Vault Bullion", sprite: "chest_bedroom" },
  ],

  // 3 Hidden Keys
  keys: [
    { id: "key_1", name: "Cell Block Key", x: 105, y: 630, ax: 135, ay: 630, color: 0x5aa9ff },
    { id: "key_2", name: "Security Override Key", x: 675, y: 365, ax: 725, ay: 365, color: 0xffc43a },
    { id: "key_3", name: "Escape Tunnel Key", x: 1090, y: 1120, ax: 1090, ay: 1175, color: 0x3dff85 },
  ],

  // Locked Prison Doors (block movement & sight until unlocked with matching key)
  lockedDoors: [
    { id: "ld_sec", name: "Security Room Door", keyId: "key_1", keyName: "Cell Block Key", x0: 740, y0: 422, x1: 800, y1: 446 },
    { id: "ld_vault", name: "Treasure Vault Door", keyId: "key_2", keyName: "Security Override Key", x0: 1260, y0: 422, x1: 1320, y1: 446 },
    { id: "ld_escape", name: "Escape Tunnel Gate", keyId: "key_3", keyName: "Escape Tunnel Key", x0: 1420, y0: 1140, x1: 1480, y1: 1164 },
  ],

  // Regular unlocked doorways (creak / slam when walked / run through)
  doors: [
    { id: "pd_a1", x: 200, y: 610, w: 22, h: 46 },
    { id: "pd_a2", x: 200, y: 790, w: 22, h: 46 },
    { id: "pd_a3", x: 200, y: 970, w: 22, h: 46 },
    { id: "pd_b1", x: 1600, y: 610, w: 22, h: 46 },
    { id: "pd_b2", x: 1600, y: 790, w: 22, h: 46 },
    { id: "pd_b3", x: 1600, y: 970, w: 22, h: 46 },
    { id: "pd_store", x: 900, y: 990, w: 68, h: 24 },
  ],

  // Noisy floor props
  props: [
    { t: "metal", x: 260, y: 1190 },
    { t: "glass", x: 275, y: 720 },
    { t: "metal", x: 460, y: 580 },
    { t: "glass", x: 640, y: 550 },
    { t: "metal", x: 780, y: 860 },
    { t: "glass", x: 1050, y: 550 },
    { t: "metal", x: 1140, y: 860 },
    { t: "glass", x: 890, y: 1140 },
    { t: "metal", x: 1360, y: 740 },
    { t: "glass", x: 1510, y: 610 },
    { t: "metal", x: 1520, y: 1020 },
    { t: "glass", x: 1450, y: 340 },
  ],

  // Creaky grates / loose floor panels
  boards: [
    [290, 1020, 64, 24],
    [550, 700, 32, 64],
    [900, 540, 70, 26],
    [900, 860, 70, 26],
    [1270, 700, 32, 64],
    [1360, 960, 64, 24],
  ],

  // Security Cameras: placed near Security Room, Central Checkpoint, and Treasure Vault
  cameras: [
    { id: "cam_checkpoint", x: 760, y: 618, angleMin: 0.25, angleMax: 1.35, speed: 0.65, range: 220, half: 0.38 },
    { id: "cam_security", x: 900, y: 160, angleMin: 1.75, angleMax: 2.85, speed: 0.72, range: 210, half: 0.40 },
    { id: "cam_vault", x: 1655, y: 165, angleMin: 1.95, angleMax: 3.05, speed: 0.75, range: 230, half: 0.38 },
  ],

  // Atmospheric lights: [x, y, radius, strength, colorType ('normal'|'flicker'|'red')]
  lights: [
    [180, 1270, 95, 0.55, "normal"],
    [340, 600, 95, 0.50, "flicker"],
    [340, 980, 95, 0.48, "normal"],
    [560, 550, 90, 0.48, "normal"],
    [900, 550, 105, 0.52, "flicker"],
    [900, 700, 120, 0.58, "red"],
    [900, 860, 105, 0.50, "normal"],
    [770, 280, 110, 0.55, "red"],
    [900, 1220, 110, 0.50, "flicker"],
    [1440, 600, 95, 0.50, "normal"],
    [1440, 980, 95, 0.48, "flicker"],
    [1450, 280, 115, 0.55, "red"],
    [1600, 1300, 105, 0.55, "normal"],
  ],

  exit: { x0: 1640, y0: 1240, x1: 1730, y1: 1360 },
  start: { x: 180, y: 1340 },

  routes: {
    // Guard A: Cell Block A & West Corridor
    A: [
      [270, 580],
      [450, 580],
      [450, 800],
      [270, 800],
      [270, 1040],
      [450, 1040],
      [450, 800],
      [540, 800],
      [540, 550],
      [270, 550],
    ],
    // Guard B: Central Checkpoint & Upper/Lower Corridor
    B: [
      [620, 550],
      [1180, 550],
      [1270, 680],
      [1180, 860],
      [900, 860],
      [900, 735],
      [620, 860],
      [550, 700],
    ],
    // Guard C: Cell Block B & East Corridor
    C: [
      [1350, 560],
      [1520, 560],
      [1520, 800],
      [1350, 800],
      [1350, 1040],
      [1520, 1040],
      [1520, 800],
      [1270, 800],
      [1270, 560],
    ],
    // Guard D: Storage Room & Lower Corridor
    D: [
      [740, 1180],
      [920, 1180],
      [960, 1340],
      [740, 1340],
      [920, 1180],
      [900, 990],
      [900, 860],
      [1080, 860],
      [900, 860],
      [900, 990],
    ],
  },
  guardStart: {
    A: [270, 580],
    B: [1180, 550],
    C: [1520, 560],
    D: [920, 1180],
  },
};

