// 所有遊戲常數

export const PHYSICS = {
  GRAVITY: -20,        // u/s²
  JUMP_V: 8,           // 跳躍初速（跳高 ~1.6u）
  MOVE_SPEED: 5,       // 水平速度（最遠跳距 ~4u）
  TERMINAL_VY: -25,    // 終端落速（防 tunneling）
  COYOTE: 0.1,         // 離地後仍可跳的寬限秒數
  BUFFER: 0.15,        // 落地前按跳的緩衝秒數
  MAX_STEP: 0.25,      // 每子步最大位移（< 最薄平台 0.5u）
  MAX_SUBSTEPS: 4,
  HALF: { x: 0.3, y: 0.7, z: 0.3 },  // 玩家 AABB 半高
  JUMP_CUT: 0.5,       // 松手截斷：小跳
  IFRAMES: 1.0,        // 受無敵秒數
  MAX_HP: 3,
};

export const CAMERA = {
  DIST: 8,
  PITCH: 0.5,          // rad ≈ 28.6°
  PITCH_MIN: 0.26,
  PITCH_MAX: 0.95,
  YAW_MOUSE: 0.0025,
  YAW_TOUCH: 0.006,
  YAW_KEY: 1.8,        // Q/E 轉速 rad/s
  SMOOTH_POS: 10,
  SMOOTH_LOOK: 14,
  FOV: 60,
};

// 角色配色（body + trim 雙色）
export const COLORS = [
  { id: 'red',    name: '經典紅', hex: 0xd94f4f, trim: 0x8c2f2f, unlock: null },
  { id: 'blue',   name: '海洋藍', hex: 0x4f7fd9, trim: 0x2f4f8c, unlock: { type: 'level', level: 1 } },
  { id: 'green',  name: '草原綠', hex: 0x5fb85f, trim: 0x357a35, unlock: { type: 'level', level: 2 } },
  { id: 'purple', name: '夢境紫', hex: 0x9a5fd9, trim: 0x5f358c, unlock: { type: 'coins', total: 25 } },
  { id: 'orange', name: '落日橙', hex: 0xe08a3c, trim: 0x8c5420, unlock: { type: 'coins', total: 50 } },
  { id: 'pink',   name: '櫻花粉', hex: 0xe57fb8, trim: 0x9c4f78, unlock: { type: 'achv', achv: 'flawless3' } },
  { id: 'gold',   name: '傳說金', hex: 0xe8c547, trim: 0x9c7f1f, unlock: { type: 'clearall' } },
];

export const ACHIEVEMENTS = [
  { id: 'first',     name: '踏上雲海',   desc: '通過第一關',           icon: '👣' },
  { id: 'coins50',   name: '貪婪收藏家', desc: '累計收集 50 枚硬幣',   icon: '🪙' },
  { id: 'jumps100',  name: '跳躍狂人',   desc: '累計跳躍 100 次',     icon: '🦘' },
  { id: 'alcoins',   name: '一枚不落',   desc: '單關收集全部硬幣',     icon: '💯' },
  { id: 'speed2',    name: '疾風迅雷',   desc: '60 秒內通過第二關',   icon: '⚡' },
  { id: 'flawless3', name: '無傷勇者',   desc: '不受傷通過第三關',     icon: '🛡️' },
  { id: 'clearall',  name: '雲上王者',   desc: '通過全部關卡',        icon: '👑' },
];

export const STORE_KEY = 'skypark.v1';
export const COIN_RADIUS = 1.2;
export const GOAL_RADIUS = 1.4;
export const LEVEL_COUNT = 3;
export const SPEED2_LIMIT = 60;  // 成就 speed2 秒數
