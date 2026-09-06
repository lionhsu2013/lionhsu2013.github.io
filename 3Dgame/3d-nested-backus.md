# 3D 平台跳躍遊戲「Sky Hopper」實作計畫

## Context

使用者想在空白目錄 `/Users/chengtsungchen/Desktop/code/3Dgame` 做一款 3D 遊戲來測試模型的開發能力。已確認的方向：

- **類型**：3D 平台跳躍（第三人稱角色在浮空平台上跳躍過關）
- **技術棧**：Three.js r160 + 原生 JS（ES modules + CDN importmap，零建置，純靜態站）
- **規模**：中型 — 完整狀態流、3 關卡、角色換色商店、成就系統、WebAudio 程序化音效、行動版觸控、localStorage 存檔

預期成果：瀏覽器直接可玩的完整小遊戲，桌面（WASD+滑鼠）與手機（搖桿+跳鈕）皆可通關。

## 檔案結構（14 個檔案）

```
3Dgame/
├── index.html          # importmap(jsdelivr pin three@0.160.0) + canvas + 所有 DOM 覆蓋層
├── css/style.css       # HUD、覆蓋層、觸控控件、toast 動畫、100dvh
└── js/
    ├── config.js       # 物理/鏡頭常數、7 種角色色、7 個成就、存檔 key
    ├── save.js         # loadSave()/persist()，try/catch，含默認值合併
    ├── achievements.js # checkAchievements(save, ctx) → 新解鎖 id[]
    ├── audio.js        # AudioFX 類別：WebAudio 合成音效（jump/coin/hit/...），init() 在首次 user gesture 內呼叫
    ├── input.js        # 鍵盤+pointer lock(含 fallback 拖曳)+Q/E+觸控 → 統一輸出
    ├── character.js    # CapsuleGeometry 身體+雙腳盒，跑步 sin 擺動、落地 squash、換色
    ├── camera.js       # FollowCamera：damp 平滑、AABB 遮蔽 ray、death/換關時 reset()
    ├── world.js        # 由關卡資料建場景；移動平台路徑運算 + frameDelta；硬幣/旗/門動畫
    ├── particles.js    # 單一 THREE.Points(256) AdditiveBlending 粒子池
    ├── game.js         # 狀態機(MENU/PLAYING/PAUSED/COMPLETE/GAMEOVER)+玩家物理+事件判定（最核心）
    └── main.js         # 初始化、DOM 接線、RAF 循環(dt clamp 0.05)、file:// 防護、window.__game debug hook
```

只用 Three.js **core**（零 examples/jsm addon）；光照只用 HemisphereLight + DirectionalLight（規避 r155 後的 `useLegacyLights` 衰減行為）。

## 關鍵設計決定

### 物理參數（先鎖死手感，關卡設計依此推導）
- 重力 −20 u/s²、**終端落速 −25**（防 tunneling）、跳躍初速 +8（跳高 1.6u）、水平 5 u/s（最遠跳距 4u）
- 玩家 AABB 半高 `(0.3, 0.7, 0.3)`；**平台最薄 0.5u**；子步 MAX_STEP 0.25u
- coyote 0.1s、jump buffer 0.15s、松手截斷 `vy *= 0.5`（點按小跳/長按滿跳）
- **關卡守則**：水平缺口 ≤3u、上升台階 ≤1.2u、平台厚 ≥0.5u

### 單幀順序（不可調換）
```
input.update(dt) → world.update(dt)【平台先動並記 frameDelta】
→ game.update: ① carry(pos += frameDelta) → ② 重力+子步逐軸 AABB 解算(Y先XZ後)
→ ③ 站地再驗證(防鬼載：腳底差≤0.02 且水平在框內) → ④ 事件判定(尖刺/墜落/硬幣/旗/門)
→ character/camera/particles 更新 → render
```

### 關鍵坑與解法（實作時必守）
1. **AABB 角落吸附 bug**：resolveY 落體吸附頂面時，須檢查「移動前腳底在該頂面之上 (eps 1e-3)」才吸附；頭撞對稱。
2. **移動平台 carry**：嚴守上述順序；碰撞後站地再驗證，不通過即 `grounded=false, groundPlat=null`。
3. **file:// 白屏**（ES module CORS）：main.js 偵測 `location.protocol==='file:'` 顯示覆蓋層指示用 `python3 -m http.server`。
4. **Pointer lock**：桌面 click→request，失敗/未鎖定 fallback 按住左鍵拖曳；`pointerlockchange` 失去鎖定且 PLAYING → 自動暫停；行動版（`maxTouchPoints>0`）完全不碰 pointer lock，用右半屏拖曳。
5. **iOS 音訊**：AudioContext 在「開始遊戲」按鈕點擊內才建立+resume；`visibilitychange` 回前景再 resume。
6. **iOS 佈局**：`100dvh`(fallback 100vh)、`viewport-fit=cover`、canvas/控件 `touch-action:none`、`user-scalable=no`；搖桿與跳鈕做成 **DOM 元素** + `setPointerCapture`，canvas 只收剩餘指（同時讓 CDP 合成事件可測）。
7. 計時器只在 PLAYING 累加；暫停恢復重置 `lastTime`；換色含 `body`+`trim` 兩色。

### 鏡頭公式
```
offset = (sin(yaw)cos(pitch)*8, sin(pitch)*8, cos(yaw)cos(pitch)*8)  # pitch≈0.5rad
target = player.pos + (0, 1.4, 0); desired = target + offset
遮蔽：從 player.pos+1.2*up 朝 desired 做 slab ray vs 全部平台 AABB → 命中則收距
camPos/lookPos/yaw 用 THREE.MathUtils.damp 平滑（幀率無關）
移動輸入：forward=(−sinYaw,0,−cosYaw), right=(cosYaw,0,−sinYaw)
```

### 關卡 schema（js/levels.js，3 關）
每關：`id, name, parTime, nextColor, sky{color,fog}, spawn, killY, hint,
boxes[{pos,size,color?}], movingPlatforms[{waypoints, period, phase, size}],
coins[[x,y,z]...], spikes[{pos,size}], checkpoints[{pos}], goal{pos}`
- 移動平台路徑：waypoints 循環 + 正弦缓動 `u=0.5−0.5cos(πu)`，`frameDelta=pos(t+dt)−pos(t)`
- **L1 浮空初階**：純靜態 11 塊平台、10 硬幣、1 旗（完整座標見 levels.js，依守則設計，缺口≤1.5u、台階≤0.7）
- **L2 雲台巡禮**：靜態減少 + 4–6 組移動平台（travel 3–6u、period 3–6s、phase 錯開）、8–10 硬幣、2 旗
- **L3 風暴尖峰**：5–7 移動平台 + 6–10 尖刺區、12 硬幣、3 旗、parTime 45

### 遊戲流程
- 生命 3 顆心；尖刺/墜落 −1 心（墜落重生於最後檢查點，iframe 1.0s）；0 心 → GAMEOVER → retry/menu
- 硬幣 1.2u 球徑拾取 + 粒子 + 音效；旗觸發變色+設重生點；門 1.4u 觸發 → COMPLETE
- 關卡完成：`best=min(old,time)`、解鎖 `nextColor`、跑成就判定 → toast+音效 → 存檔 → 完成覆蓋層（新紀錄高亮）→ 下關/回選單
- 成就 7 個範例：首通、累計硬幣 50、單關全收集、L2 60s 內通關、L3 無傷、累計跳 100、全關通關
- 存檔 key `skypark.v1`：`{version, levels{best,cleared,coins}, totalCoins, totalJumps, unlockedColors, selectedColor, achievements, muted}`

## 實作順序（每階段獨立可驗證）

| 階段 | 內容 | 驗收標準 |
|---|---|---|
| S0 骨架 | index.html+importmap、renderer/scene/光/霧、1 平台、RAF、CSS 雛形 | 本地 server 開啟無 console error，平台可見 |
| S1 物理+鍵盤 | 玩家盒、AABB 逐軸+子步、coyote/buffer/截斷、WASD/Space | 測試場能跑跳、頂頭、側撞；**從 50u 高空落下不穿透 0.5u 薄台**；切 tab 回來不飛出 |
| S2 鏡頭+角色 | FollowCamera（拖曳+Q/E）、capsule 角色+腳擺動+squash | 鏡頭平滑跟隨無抖動；跑動腳擺動 |
| S3 關卡系統 | L1、World.build、HUD、PLAYING↔COMPLETE、檢查點/墜落重生 | **L1 可從頭打到尾**，計時正確 |
| S4 移動平台+L2/L3 | 路徑運算、carry 全套、L2/L3 | 站移動平台兩方向被載、跑下不鬼載；L2/L3 可通關 |
| S5 尖刺+死亡 | spike/iframe/擊退、GAMEOVER 流、pointer lock(fallback) | 中刺掉心+無敵閃爍；死亡→重試可通關；ESC 暫停正常 |
| S6 存檔+成就 | save.js、7 成就、toast、best time | 通關後刷新存檔保留；成就 toast；`localStorage` 欄位正確 |
| S7 商店+換色 | 7 色解鎖、商店 UI、選色 | L1 後藍色解鎖；選色生效且重載保留 |
| S8 音效 | AudioFX 全音效、gesture init、mute 持久 | 各事件有聲；首次點擊後解鎖；mute 存檔 |
| S9 行動版+打磨 | 搖桿/跳鈕/拖轉、dvh、touch-action、visibility 暫停、主選單背景鏡頭、粒子 | 手機視口全功能可玩；多指不衝突；3 關雙端 QA 通關 |

## 驗證方式

```bash
cd /Users/chengtsungchen/Desktop/code/3Dgame
python3 -m http.server 8000    # → http://127.0.0.1:8000（不可用 file:// 直開）
```

用 chrome-devtools MCP 每階段驗證：
1. `new_page` → `list_console_messages(types=["error"])` 必須為空
2. `take_screenshot` 關鍵畫面（選單/遊戲中/完成屏）
3. 狀態斷言（game.js 暴露 `window.__game`）：`evaluate_script` 讀 `{state, hp, coins, pos, grounded, time}`
4. 物理 corner case 用 debug hook 自動化：`__game.debug.teleport(0,50,0)` 自由落體→斷言落點在平台頂面 ±0.05；站移動平台 1s 斷言 x 跟隨平台 ±0.1
5. 行動版：`emulate(viewport="390x844x3,mobile,touch")` + 合成 PointerEvent 驅動 DOM 搖桿/跳鈕；最後真機驗音訊解鎖與無橡皮筋
6. 每個 JS 檔 `node --check` 先過語法

## 風險 TOP 3（對策已內建於設計）

1. **移動平台 carry 抖動/鬼載** — 最高風險；嚴守幀順序 + S4 獨立驗收（雙向載運、跑下不拉回、上升平台夾天花板不抖）
2. **iOS 觸控/音訊怪癖** — 音訊首 gesture init、dvh、DOM 化觸控件 + pointer capture；S9 真機驗
3. **物理穩定性**（dt 尖峰/角落吸附/薄台穿透）— dt clamp 0.05 + 終端速 + 子步 + Y 解算前置條件；S1 高空跌落測試鎖死
