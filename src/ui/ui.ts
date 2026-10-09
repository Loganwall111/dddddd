// UI manager builds the HTML/DOM overlay (main menu, HUD, pause menu, inventory,
// dialogs) and wires them to game state.
import { BLOCKS, BlockId, T } from "../blocks/blocks";
import { Inventory, ItemStack, CREATIVE_TABS, RECIPES, SMELT_RECIPES, SMELT_TIME } from "../inventory/inventory";
import { FurnaceState } from "../crafting/furnace";
import { generateBlockAtlas, tileUV } from "../blocks/textureGen";
import { SavedWorld, exportWorld, importWorld } from "../persistence/storage";
import { WorldType } from "../world/generator";
import { NetSession, Advert } from "../net/net";

export interface UIHandles {
  onStartWorld: (world: { name: string; seedStr: string; gameMode: "creative"|"survival"; worldType: WorldType; existingId?: string; host?: boolean; hostName?: string }) => void;
  onJoinWorld: (name: string, advert: Advert) => void;
  onDeleteWorld: (id: string) => void;
  onResume: () => void;
  onQuitToMenu: () => void;
  onTogglePause: () => void;
  onToggleInventory: () => void;
  onSelectSlot: (slot: number) => void;
  onToggleFlight: () => void;
  onGameModeToggle: () => void;
  onSettingsApply: (s: Settings) => void;
  onToggleView?: () => void;
}

export interface Settings {
  renderDistance: number;
  fov: number;
  sensitivity: number;
  masterVolume: number;
  graphics: "low" | "medium" | "high";
}

const defaultSettings: Settings = { renderDistance: 6, fov: 70, sensitivity: 1, masterVolume: 0.7, graphics: "medium" };

export class UIManager {
  root: HTMLElement;
  handles: UIHandles;
  settings: Settings = { ...defaultSettings };
  private inGame = false;
  paused = false;
  invOpen = false;
  private inventory!: Inventory;
  private worldMeta: Partial<SavedWorld> | null = null;
  // Icon URL (generated from atlas) for use in inventory hotbar
  iconUrls: Map<number, string> = new Map();
  private hudCrosshair!: HTMLElement;
  private hotbarEl!: HTMLElement;
  private modeEl!: HTMLElement;
  private coordsEl!: HTMLElement;
  private toastRoot!: HTMLElement;
  private healthBar!: HTMLElement;
  private hungerBar!: HTMLElement;
  private fpsEl!: HTMLElement;
  private breakOverlay!: HTMLElement;

  constructor(root: HTMLElement, handles: UIHandles) {
    this.root = root;
    this.handles = handles;
    this.generateIcons();
    this.applyUiTextures();
  }

  // Generate original dirt/stone/gray pixel tiles and expose them as CSS variables
  // so panels and buttons get a classic block-game texture feel.
  private applyUiTextures() {
    const mk = (size: number, painter: (ctx: CanvasRenderingContext2D) => void): string => {
      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      const ctx = c.getContext("2d")!;
      painter(ctx);
      return c.toDataURL("image/png");
    };
    const rnd = (() => { let s = 12345; return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s & 0xffff) / 0xffff; }; })();

    const dirt = mk(32, ctx => {
      ctx.fillStyle = "#79553a"; ctx.fillRect(0, 0, 32, 32);
      const pal = ["#6b4a30", "#8a6244", "#5e402a", "#96704e"];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        if (rnd() < 0.5) { ctx.fillStyle = pal[Math.floor(rnd() * pal.length)]; ctx.fillRect(x, y, 1, 1); }
      }
    });
    const stone = mk(32, ctx => {
      ctx.fillStyle = "#7e7e7e"; ctx.fillRect(0, 0, 32, 32);
      const pal = ["#6e6e6e", "#8e8e8e", "#616161", "#9a9a9a"];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        if (rnd() < 0.5) { ctx.fillStyle = pal[Math.floor(rnd() * pal.length)]; ctx.fillRect(x, y, 1, 1); }
      }
    });
    const gray = mk(32, ctx => {
      ctx.fillStyle = "#c6c6c6"; ctx.fillRect(0, 0, 32, 32);
      const pal = ["#bdbdbd", "#cfcfcf", "#b2b2b2"];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        if (rnd() < 0.25) { ctx.fillStyle = pal[Math.floor(rnd() * pal.length)]; ctx.fillRect(x, y, 1, 1); }
      }
    });

    const rs = document.documentElement.style;
    rs.setProperty("--dirt-tex", `url(${dirt})`);
    rs.setProperty("--stone-tex", `url(${stone})`);
    rs.setProperty("--gray-tex", `url(${gray})`);
  }

  private generateIcons() {
    const { atlas } = generateBlockAtlas();
    // Extract each tile into individual image data URLs
    const tileSize = 16;
    const tmp = document.createElement("canvas");
    tmp.width = 32; tmp.height = 32;
    const tctx = tmp.getContext("2d")!;
    tctx.imageSmoothingEnabled = false;
    for (let i = 0; i < 128; i++) {
      const tx = i % 16, ty = Math.floor(i/16);
      tctx.clearRect(0,0,32,32);
      tctx.drawImage(atlas, tx*tileSize, ty*tileSize, tileSize, tileSize, 0, 0, 32, 32);
      this.iconUrls.set(i, tmp.toDataURL("image/png"));
    }
  }

  private logoUrl?: string;
  // Original blocky stone-textured logo, drawn at runtime (no external assets).
  makeLogo(): string {
    if (this.logoUrl) return this.logoUrl;
    const c = document.createElement("canvas");
    c.width = 720; c.height = 160;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const text = "MASS AWAKENING";
    ctx.font = "900 64px 'Courier New', monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    // 3D extrusion: dark depth copies
    for (let d = 8; d >= 1; d--) {
      ctx.fillStyle = d > 5 ? "#1a1a1a" : "#3f3f3f";
      ctx.fillText(text, 360 + d, 78 + d);
    }
    // stone face
    ctx.fillStyle = "#d8d8d8";
    ctx.fillText(text, 360, 78);
    // stone speckle clipped to the glyphs
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    const r = (() => { let s = 42; return () => { s = (s * 1664525 + 2013904223) >>> 0; return (s & 0xffff) / 0xffff; }; })();
    const pal = ["#c4c4c4", "#e6e6e6", "#b0b0b0", "#9a9a9a"];
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = pal[Math.floor(r() * pal.length)];
      ctx.fillRect(Math.floor(r() * 720), Math.floor(r() * 160), 2, 2);
    }
    // cracks
    ctx.strokeStyle = "#6e6e6e"; ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      let x = r() * 720, y = r() * 160;
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 26; y += (r() - 0.5) * 26; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.restore();
    this.logoUrl = c.toDataURL("image/png");
    return this.logoUrl;
  }

  iconFor(block: BlockId): string | undefined {
    const def = BLOCKS[block]; if (!def) return undefined;
    const tIdx = def.textures.all !== undefined ? def.textures.all : (def.textures.side ?? def.textures.top ?? 0);
    return this.iconUrls.get(tIdx);
  }

  showMainMenu(saved: SavedWorld[]) {
    this.inGame = false;
    this.root.innerHTML = "";
    const splashes = ["Now with TNT!", "Three dimensions!", "100% original pixels!", "Punch a tree!", "Sleep is overrated!", "As seen on TV!", "Waterproof!*", "Craft. Mine. Awaken.", "Now multiplayer!", "Also try the Nether!", "Polar bears included!"];
    const splash = splashes[Math.floor(Math.random() * splashes.length)];
    const menu = document.createElement("div");
    menu.className = "menu-root";
    menu.innerHTML = `
      <div class="menu-logo-wrap">
        <img class="menu-logo" src="${this.makeLogo()}" alt="MASS AWAKENING" />
        <div class="menu-splash">${splash}</div>
      </div>
      <div class="menu-panel">
        <button class="mc-btn" data-act="singleplayer">Singleplayer</button>
        <button class="mc-btn" data-act="multiplayer">Multiplayer</button>
        <button class="mc-btn" data-act="settings">Options...</button>
        <button class="mc-btn" data-act="credits">Controls &amp; Credits</button>
      </div>
      <div class="menu-version">Mass Awakening v0.2 · Babylon.js</div>
      <div class="menu-footer">©2026 Mass Awakening — original assets &amp; code</div>
    `;
    this.root.appendChild(menu);
    menu.querySelectorAll<HTMLButtonElement>(".mc-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        const act = btn.dataset.act;
        if (act === "singleplayer") this.showWorldSelect(saved);
        else if (act === "settings") this.showSettings();
        else if (act === "credits") this.showCredits();
        else if (act === "multiplayer") this.showMultiplayerDialog();
      });
    });
  }

  private showMultiplayerDialog() {
    if (!NetSession.supported()) {
      alert("Multiplayer requires BroadcastChannel support in this browser.");
      return;
    }
    const dlg = document.createElement("div");
    dlg.className = "dialog-backdrop";
    dlg.innerHTML = `
      <div class="dialog" style="min-width:520px;">
        <h2>MULTIPLAYER</h2>
        <div class="row"><label>Your Name</label><input id="mpname" value="${escapeHtml(this.mpName)}" maxlength="14" /></div>
        <div style="color:#a8b8d0; font-size:12px; margin:6px 0 10px; text-shadow:1px 1px 0 #000;">
          Play together across tabs/windows of this browser. Open the game in a
          second tab and it will see your world listed here.
        </div>
        <button class="mc-btn primary" data-act="host" style="width:100%; margin-bottom:12px;">HOST A NEW WORLD</button>
        <div class="inv-label" style="color:#d8d8d8;">OPEN WORLDS</div>
        <div class="world-list mp-list" style="max-height:160px;"></div>
        <div class="actions">
          <button class="mc-btn" data-act="refresh">REFRESH</button>
          <button class="mc-btn" data-act="close">BACK</button>
        </div>
      </div>
    `;
    this.root.appendChild(dlg);
    const list = dlg.querySelector(".mp-list") as HTMLElement;
    let cancel: (() => void) | null = null;
    const startList = () => {
      cancel?.();
      cancel = NetSession.listGames((games) => {
        list.innerHTML = "";
        if (games.length === 0) {
          list.innerHTML = `<div style="padding:12px; color:#8aa; font-size:12px;">No open worlds found. Host one, or open this game in another tab.</div>`;
          return;
        }
        for (const g of games) {
          const row = document.createElement("div");
          row.className = "world-item";
          row.innerHTML = `
            <div>
              <div style="color:#e0ecff; font-weight:bold;">${escapeHtml(g.meta.worldName)} <span style="color:#9f9;">(${g.players})</span></div>
              <div class="world-meta">host ${escapeHtml(g.hostName)} &middot; ${g.meta.gameMode} &middot; seed ${g.meta.seed}</div>
            </div>
            <div class="world-actions"><button class="mini-btn" data-act="join">JOIN</button></div>`;
          row.addEventListener("click", (e) => {
            if ((e.target as HTMLElement).dataset.act !== "join") return;
            this.mpName = (dlg.querySelector("#mpname") as HTMLInputElement).value || this.mpName;
            cancel?.();
            dlg.remove();
            this.handles.onJoinWorld(this.mpName, g);
          });
          list.appendChild(row);
        }
      });
    };
    startList();
    dlg.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).dataset.act;
      if (act === "close") { cancel?.(); dlg.remove(); this.showMainMenu([]); }
      else if (act === "refresh") startList();
      else if (act === "host") {
        this.mpName = (dlg.querySelector("#mpname") as HTMLInputElement).value || this.mpName;
        cancel?.();
        dlg.remove();
        this.showCreateWorld([], true);
      }
    });
  }
  mpName = "Steve" + Math.floor(Math.random() * 90 + 10);

  private showWorldSelect(saved: SavedWorld[]) {
    this.root.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "dialog-backdrop";
    wrap.innerHTML = `
      <div class="mc-screen" style="width:660px;">
        <h2 class="screen-title">Select World</h2>
        <input class="mc-search" data-role="search" />
        <div class="world-list" style="height:250px;"></div>
        <div class="screen-btns">
          <button class="mc-btn wide" data-act="play">Play Selected World</button>
          <button class="mc-btn wide" data-act="create">Create New World</button>
          <div class="row4">
            <button class="mc-btn" data-act="edit">Edit</button>
            <button class="mc-btn" data-act="delete">Delete</button>
            <button class="mc-btn" data-act="recreate">Re-Create</button>
            <button class="mc-btn" data-act="back">Back</button>
          </div>
        </div>
      </div>
    `;
    this.root.appendChild(wrap);
    const list = wrap.querySelector(".world-list") as HTMLElement;
    const search = wrap.querySelector('[data-role="search"]') as HTMLInputElement;
    let selectedId: string | null = saved[0]?.id ?? null;
    const grassIcon = this.iconFor(BlockId.Grass) || "";
    const render = () => {
      const q = (search.value || "").toLowerCase();
      list.innerHTML = "";
      const shown = saved.filter(w => w.name.toLowerCase().includes(q));
      if (shown.length === 0) {
        list.innerHTML = `<div style="padding:20px; color:#8aa;">No worlds. Create one!</div>`;
        return;
      }
      for (const w of shown) {
        const div = document.createElement("div");
        div.className = "world-item" + (w.id === selectedId ? " selected" : "");
        div.innerHTML = `
          <img class="world-icon" src="${grassIcon}" alt="" />
          <div>
            <div style="color:#f8f8f8; font-weight:bold;">${escapeHtml(w.name)}</div>
            <div class="world-meta">${escapeHtml(w.name)} (${new Date(w.lastPlayed).toLocaleString()})<br/>
            ${w.gameMode === "creative" ? "Creative Mode" : "Survival Mode"}, seed ${w.seed}, Version: v0.2</div>
          </div>`;
        div.addEventListener("click", () => { selectedId = w.id; render(); });
        div.addEventListener("dblclick", () => { this.playWorld(w); });
        list.appendChild(div);
      }
    };
    search.addEventListener("input", render);
    render();

    wrap.addEventListener("click", async (e) => {
      const act = (e.target as HTMLElement).dataset.act;
      const sel = saved.find(w => w.id === selectedId) ?? null;
      if (act === "back") { wrap.remove(); this.showMainMenu(saved); }
      else if (act === "create") this.showCreateWorld(saved, false);
      else if (act === "play") { if (sel) this.playWorld(sel); }
      else if (act === "delete") {
        if (!sel) return;
        if (confirm(`Delete world "${sel.name}"? This cannot be undone.`)) {
          this.handles.onDeleteWorld(sel.id);
          saved = saved.filter(x => x.id !== sel.id);
          selectedId = saved[0]?.id ?? null;
          render();
        }
      }
      else if (act === "recreate") {
        if (!sel) return;
        if (confirm(`Re-create "${sel.name}"? All builds and edits will be erased, terrain regenerated from the same seed.`)) {
          const { saveChunks } = await import("../persistence/storage");
          for (const dim of ["overworld", "nether", "end"]) await saveChunks(sel.id, dim, []);
          this.playWorld(sel);
        }
      }
      else if (act === "edit") {
        if (!sel) return;
        const dlg = document.createElement("div");
        dlg.className = "dialog-backdrop";
        dlg.innerHTML = `
          <div class="dialog">
            <h2>EDIT WORLD</h2>
            <div class="row"><label>World Name</label><input id="ename" value="${escapeHtml(sel.name)}" /></div>
            <div class="row"><label>Seed</label><input value="${sel.seed}" disabled /></div>
            <div class="actions">
              <button class="mc-btn" data-act="export">EXPORT FILE</button>
              <button class="mc-btn primary" data-act="save">SAVE</button>
              <button class="mc-btn" data-act="cancel">CANCEL</button>
            </div>
          </div>`;
        this.root.appendChild(dlg);
        dlg.addEventListener("click", async (ev) => {
          const a = (ev.target as HTMLElement).dataset.act;
          if (a === "cancel") dlg.remove();
          else if (a === "export") this.exportWorldFile(sel.id, sel.name);
          else if (a === "save") {
            sel.name = (dlg.querySelector("#ename") as HTMLInputElement).value || sel.name;
            const { saveWorldMeta } = await import("../persistence/storage");
            await saveWorldMeta(sel as SavedWorld);
            dlg.remove(); render();
          }
        });
      }
    });
  }

  private playWorld(w: SavedWorld) {
    this.dismissDialog();
    this.showLoading(`Loading ${w.name}...`);
    this.handles.onStartWorld({ name: w.name, seedStr: String(w.seed), gameMode: w.gameMode, worldType: w.worldType, existingId: w.id });
  }

  private async refreshSaved(): Promise<SavedWorld[]> {
    const { listWorlds } = await import("../persistence/storage");
    return listWorlds();
  }

  private async exportWorldFile(id: string, name: string) {
    try {
      const data = await exportWorld(id);
      if (!data) { this.toast("Nothing to export"); return; }
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/[^a-z0-9-_ ]/gi, "_")}.massawakening.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      this.toast("World exported");
    } catch (e) {
      this.toast("Export failed");
    }
  }

  private showCreateWorld(saved: SavedWorld[], host: boolean) {
    const dlg = document.createElement("div");
    dlg.className = "dialog-backdrop";
    let mode: "creative" | "survival" = "survival";
    const descs: Record<string, string> = {
      survival: "Search for resources, crafting, gain<br/>levels, health and hunger",
      creative: "Unlimited blocks, flight, no danger.<br/>Build anything you can imagine.",
    };
    dlg.innerHTML = `
      <div class="mc-screen" style="width:480px;">
        <h2 class="screen-title">Create New World</h2>
        <div class="field-label">World Name</div>
        <input class="mc-input" id="wname" value="New World" />
        <div class="hint">Will be saved in: Your Browser${host ? " + hosted for other tabs" : ""}</div>
        <button class="mc-btn wide" id="wmodebtn" style="margin:14px 0 6px;">Game Mode: Survival</button>
        <div class="mode-desc" id="wdesc">${descs.survival}</div>
        <button class="mc-btn wide" id="wmorebtn" style="margin-top:14px;">More World Options...</button>
        <div class="more-opts" style="display:none;">
          <div class="row"><label>Seed</label><input id="wseed" placeholder="(random)" /></div>
          <div class="row"><label>World Type</label>
            <select id="wtype">
              <option value="normal" selected>Normal</option>
              <option value="amplified">Amplified</option>
              <option value="flat">Flat</option>
            </select>
          </div>
        </div>
        <div class="row2" style="margin-top:18px;">
          <button class="mc-btn primary" data-act="create">Create New World</button>
          <button class="mc-btn" data-act="cancel">Cancel</button>
        </div>
      </div>
    `;
    this.root.appendChild(dlg);
    const modeBtn = dlg.querySelector("#wmodebtn") as HTMLButtonElement;
    modeBtn.addEventListener("click", () => {
      mode = mode === "survival" ? "creative" : "survival";
      modeBtn.textContent = `Game Mode: ${mode === "survival" ? "Survival" : "Creative"}`;
      (dlg.querySelector("#wdesc") as HTMLElement).innerHTML = descs[mode];
    });
    (dlg.querySelector("#wmorebtn") as HTMLButtonElement).addEventListener("click", () => {
      const m = dlg.querySelector(".more-opts") as HTMLElement;
      m.style.display = m.style.display === "none" ? "block" : "none";
    });
    dlg.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.dataset.act === "cancel") { dlg.remove(); this.showWorldSelect(saved); }
      else if (t.dataset.act === "create") {
        const name = (dlg.querySelector("#wname") as HTMLInputElement).value || "World";
        const seedStr = (dlg.querySelector("#wseed") as HTMLInputElement)?.value || String(Math.floor(Math.random() * 1e9));
        const type = ((dlg.querySelector("#wtype") as HTMLSelectElement)?.value || "normal") as WorldType;
        dlg.remove();
        this.showLoading(`Generating ${name}...`);
        this.handles.onStartWorld({ name, seedStr, gameMode: mode, worldType: type, host, hostName: this.mpName });
      }
    });
  }


  showSettings() {
    const dlg = document.createElement("div");
    dlg.className = "dialog-backdrop";
    dlg.innerHTML = `
      <div class="dialog">
        <h2>SETTINGS</h2>
        <div class="row"><label>Render Distance</label><input id="rd" type="number" min="3" max="16" value="${this.settings.renderDistance}" /></div>
        <div class="row"><label>Field of View</label><input id="fov" type="number" min="50" max="110" value="${this.settings.fov}" /></div>
        <div class="row"><label>Sensitivity</label><input id="sens" type="number" min="0.2" max="3" step="0.1" value="${this.settings.sensitivity}" /></div>
        <div class="row"><label>Master Volume</label><input id="vol" type="range" min="0" max="1" step="0.05" value="${this.settings.masterVolume}" /></div>
        <div class="row"><label>Graphics</label>
          <select id="gfx">
            <option value="low"${this.settings.graphics==='low'?' selected':''}>Low</option>
            <option value="medium"${this.settings.graphics==='medium'?' selected':''}>Medium</option>
            <option value="high"${this.settings.graphics==='high'?' selected':''}>High</option>
          </select>
        </div>
        <div class="actions">
          <button class="mc-btn" data-act="close">CLOSE</button>
          <button class="mc-btn primary" data-act="apply">APPLY</button>
        </div>
      </div>
    `;
    this.root.appendChild(dlg);
    dlg.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.dataset.act === "close" || t.dataset.act === "apply") {
        if (t.dataset.act === "apply") {
          this.settings.renderDistance = parseInt((dlg.querySelector("#rd") as HTMLInputElement).value) || 6;
          this.settings.fov = parseInt((dlg.querySelector("#fov") as HTMLInputElement).value) || 70;
          this.settings.sensitivity = parseFloat((dlg.querySelector("#sens") as HTMLInputElement).value) || 1;
          this.settings.masterVolume = parseFloat((dlg.querySelector("#vol") as HTMLInputElement).value);
          this.settings.graphics = (dlg.querySelector("#gfx") as HTMLSelectElement).value as any;
          this.handles.onSettingsApply(this.settings);
        }
        dlg.remove();
        if (!this.inGame) this.showMainMenu([]);
      }
    });
  }

  showCredits() {
    const dlg = document.createElement("div");
    dlg.className = "dialog-backdrop";
    dlg.innerHTML = `
      <div class="dialog" style="min-width:480px;">
        <h2>CONTROLS</h2>
        <div style="color:#cde; font-size:13px; line-height:1.9;">
          <b>WASD</b> &mdash; Move<br/>
          <b>Mouse</b> &mdash; Look<br/>
          <b>Space</b> &mdash; Jump / Fly up (Creative)<br/>
          <b>Shift</b> &mdash; Sprint (Survival) / Fly down (Creative)<br/>
          <b>Left Click</b> &mdash; Break block / Attack<br/>
          <b>Right Click</b> &mdash; Place block<br/>
          <b>1 - 9 / Scroll</b> &mdash; Hotbar<br/>
          <b>E</b> &mdash; Inventory<br/>
          <b>F</b> &mdash; Toggle flight (Creative)<br/>
          <b>Esc</b> &mdash; Pause menu<br/>
          <b>F3 + G</b> &mdash; Toggle game mode (Cheat)
        </div>
        <div style="margin-top:16px; color:#8a9cb0; font-size:12px;">
          Built with Babylon.js &middot; TypeScript &middot; Vite.<br/>
          Original pixel-art textures &amp; code &mdash; Mass Awakening project.
        </div>
        <div class="actions"><button class="mc-btn primary" data-act="close">CLOSE</button></div>
      </div>
    `;
    this.root.appendChild(dlg);
    dlg.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.dataset.act === "close") { dlg.remove(); this.showMainMenu([]); }
    });
  }

  private dismissDialog() {
    const bd = this.root.querySelector(".dialog-backdrop"); if (bd) bd.remove();
  }

  showLoading(text: string) {
    this.root.innerHTML = `
      <div class="loading-overlay">
        <div>MASS AWAKENING</div>
        <div class="spinner"></div>
        <div style="font-size:14px; color:#cfe; letter-spacing:0.2em;">${escapeHtml(text)}</div>
        <div class="loading-bar"><div class="loading-bar-fill" style="width:30%;"></div></div>
      </div>
    `;
  }
  setLoadingProgress(pct: number, text?: string) {
    const fill = this.root.querySelector(".loading-bar-fill") as HTMLElement;
    if (fill) fill.style.width = `${pct}%`;
    if (text) {
      const l = this.root.querySelectorAll(".loading-overlay > div")[2] as HTMLElement;
      if (l) l.textContent = text;
    }
  }
  hideLoading() {
    const l = this.root.querySelector(".loading-overlay"); if (l) l.remove();
  }

  enterGame(inventory: Inventory, mode: "creative" | "survival", dimName: string) {
    this.inGame = true;
    this.paused = false;
    this.invOpen = false;
    this.inventory = inventory;
    this.root.innerHTML = `
      <div class="hud">
        <div class="crosshair"></div>
        <div class="break-overlay" style="display:none;"></div>
        <div class="mode-indicator">${mode.toUpperCase()} · ${dimName.toUpperCase()}</div>
        <div class="coords">X: 0 Y: 0 Z: 0</div>
        <div class="debug-fps">FPS: 0</div>
        <div class="survival-bars" style="display:${mode==='survival'?'flex':'none'};">
          <div class="bar-row hearts"></div>
          <div class="bar-row hunger"></div>
        </div>
        <div class="xp-bar"><div class="xp-fill" style="width:0%"></div><div class="xp-level"></div></div>
        <div class="hotbar"></div>
        <div class="toast-row"></div>
        <div class="chat-root"></div>
        <input class="chat-input" style="display:none;" maxlength="120" placeholder="Chat message... (Enter to send, Esc to cancel)" />
      </div>
    `;
    this.hudCrosshair = this.root.querySelector(".crosshair")!;
    this.hotbarEl = this.root.querySelector(".hotbar")!;
    this.modeEl = this.root.querySelector(".mode-indicator")!;
    this.coordsEl = this.root.querySelector(".coords")!;
    this.fpsEl = this.root.querySelector(".debug-fps")!;
    this.healthBar = this.root.querySelector(".hearts")!;
    this.hungerBar = this.root.querySelector(".hunger")!;
    this.toastRoot = this.root.querySelector(".toast-row")!;
    this.breakOverlay = this.root.querySelector(".break-overlay")!;
    this.xpFill = this.root.querySelector(".xp-fill") as HTMLElement;
    this.xpLevel = this.root.querySelector(".xp-level") as HTMLElement;
    this.chatRoot = this.root.querySelector(".chat-root") as HTMLElement;
    this.chatInput = this.root.querySelector(".chat-input") as HTMLInputElement;
    this.renderHotbar();
    this.renderSurvivalBars(20, 20);
  }

  private xpFill!: HTMLElement;
  private xpLevel!: HTMLElement;
  private chatRoot!: HTMLElement;
  private chatInput!: HTMLInputElement;
  chatOpen = false;

  renderXP(level: number, progress01: number) {
    if (!this.xpFill) return;
    this.xpFill.style.width = `${Math.round(progress01 * 100)}%`;
    this.xpLevel.textContent = level > 0 ? String(level) : "";
  }

  addChatLine(line: string) {
    if (!this.chatRoot) return;
    const el = document.createElement("div");
    el.className = "chat-line";
    el.textContent = line;
    this.chatRoot.appendChild(el);
    while (this.chatRoot.children.length > 7) this.chatRoot.removeChild(this.chatRoot.firstChild!);
    setTimeout(() => { el.classList.add("fade"); setTimeout(() => el.remove(), 1200); }, 9000);
  }

  openChat(onSend: (text: string) => void) {
    if (!this.chatInput) return;
    this.chatOpen = true;
    this.chatInput.style.display = "block";
    this.chatInput.value = "";
    this.chatInput.focus();
    const done = () => {
      this.chatInput.style.display = "none";
      this.chatOpen = false;
      this.chatInput.onkeydown = null;
      this.chatInput.onblur = null;
    };
    this.chatInput.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { const t = this.chatInput.value.trim(); done(); if (t) onSend(t); }
      else if (e.key === "Escape") { done(); }
    };
    this.chatInput.onblur = () => done();
  }

  renderHotbar() {
    if (!this.hotbarEl) return;
    this.hotbarEl.innerHTML = "";
    const inv = this.inventory;
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement("div");
      slot.className = "hotbar-slot" + (i === inv.selectedHotbar ? " selected" : "");
      const s = inv.slots[i];
      slot.innerHTML = `<div class="index">${i+1}</div>` + (s && BLOCKS[s.id] ? `<img class="icon" src="${this.iconFor(s.id)}" alt="${BLOCKS[s.id].name}"/>${s.count>1?`<div class="count">${s.count}</div>`:''}` : "");
      slot.addEventListener("click", () => {
        inv.setSelectedSlot(i);
        this.handles.onSelectSlot(i);
        this.renderHotbar();
      });
      this.hotbarEl.appendChild(slot);
    }
  }

  private heartUrl?: string;
  private heartEmptyUrl?: string;
  private hungerUrl?: string;
  private hungerEmptyUrl?: string;

  private makeIcon(pixels: string[], palette: Record<string, string>): string {
    const s = 9;
    const c = document.createElement("canvas");
    c.width = s; c.height = s;
    const ctx = c.getContext("2d")!;
    for (let y = 0; y < s; y++) {
      const row = pixels[y] || "";
      for (let x = 0; x < s; x++) {
        const ch = row[x];
        if (ch && palette[ch]) { ctx.fillStyle = palette[ch]; ctx.fillRect(x, y, 1, 1); }
      }
    }
    return c.toDataURL("image/png");
  }

  private ensureBarIcons() {
    if (this.heartUrl) return;
    const heart = [
      ".XX.XX..",
      "XRRXRRX.",
      "XRRRRRRX",
      "XRRRRRRX",
      ".XRRRRX.",
      "..XRRX..",
      "...XX...",
      "........",
    ];
    const heartPal = { X: "#7a1020", R: "#e23434" };
    const heartPalEmpty = { X: "#3a2a2a", R: "#5a4040" };
    this.heartUrl = this.makeIcon(heart, heartPal);
    this.heartEmptyUrl = this.makeIcon(heart, heartPalEmpty);
    const drum = [
      "..XXXX..",
      ".XBBBX..",
      "XBBBBBX.",
      "XBBBBBX.",
      ".XBBBXX.",
      "..XXXW..",
      "....WW..",
      "........",
    ];
    this.hungerUrl = this.makeIcon(drum, { X: "#6a4a20", B: "#c49a5a", W: "#f0e8d8" });
    this.hungerEmptyUrl = this.makeIcon(drum, { X: "#3a3228", B: "#5a5040", W: "#6a6258" });
  }

  renderSurvivalBars(health: number, hunger: number) {
    if (!this.healthBar) return;
    this.ensureBarIcons();
    const draw = (el: HTMLElement, value: number, fullUrl: string, emptyUrl: string) => {
      el.innerHTML = "";
      for (let i = 0; i < 10; i++) {
        const h = document.createElement("div");
        const v = value - i * 2;
        const url = v >= 1 ? fullUrl : emptyUrl;
        h.style.background = `url(${url})`;
        h.style.width = "16px"; h.style.height = "16px";
        h.style.backgroundSize = "contain"; h.style.backgroundRepeat = "no-repeat";
        h.style.imageRendering = "pixelated";
        h.style.opacity = v >= 1 ? "1" : "0.6";
        el.appendChild(h);
      }
    };
    draw(this.healthBar, health, this.heartUrl!, this.heartEmptyUrl!);
    draw(this.hungerBar, hunger, this.hungerUrl!, this.hungerEmptyUrl!);
  }

  updateCoords(x: number, y: number, z: number, dim?: string) {
    if (this.coordsEl) this.coordsEl.textContent = `X: ${x.toFixed(1)}  Y: ${y.toFixed(1)}  Z: ${z.toFixed(1)}${dim?'  ['+dim+']':''}`;
  }
  updateFPS(fps: number) { if (this.fpsEl) this.fpsEl.textContent = `FPS: ${fps|0}`; }
  setModeLabel(text: string) { if (this.modeEl) this.modeEl.textContent = text; }

  toast(msg: string, ms = 2200) {
    if (!this.toastRoot) {
      if (!msg) return;
      // root not ready; drop
      return;
    }
    if (!msg) { this.toastRoot.innerHTML = ""; return; }
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    this.toastRoot.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  showBreakProgress(x: number, y: number, z: number, progress: number) {
    if (!this.breakOverlay) return;
    this.breakOverlay.style.display = "block";
    // Draw a simple crack overlay SVG based on progress
    const stage = Math.min(9, Math.floor(progress * 10));
    const size = 28 + Math.floor(progress * 8);
    this.breakOverlay.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <rect x="0" y="0" width="16" height="1" fill="#000" opacity="0.8"/>
      <rect x="0" y="15" width="16" height="1" fill="#000" opacity="0.8"/>
      <rect x="0" y="0" width="1" height="16" fill="#000" opacity="0.8"/>
      <rect x="15" y="0" width="1" height="16" fill="#000" opacity="0.8"/>
      ${Array.from({length: stage}, () => `<rect x="${Math.floor(Math.random()*14)+1}" y="${Math.floor(Math.random()*14)+1}" width="${1+Math.floor(Math.random()*2)}" height="${1+Math.floor(Math.random()*2)}" fill="#000" opacity="0.75"/>`).join("")}
    </svg>`;
  }
  hideBreakProgress() { if (this.breakOverlay) this.breakOverlay.style.display = "none"; }

  showPauseMenu() {
    this.paused = true;
    if (this.root.querySelector(".pause-root")) return;
    const menu = document.createElement("div");
    menu.className = "pause-root";
    menu.innerHTML = `
      <h1>Game Menu</h1>
      <div class="pause-actions">
        <button class="mc-btn highlighted wide" data-act="resume">Back to Game</button>
        <div class="row2">
          <button class="mc-btn" data-act="inv">Inventory</button>
          <button class="mc-btn" data-act="view">Toggle View (V)</button>
        </div>
        <div class="row2">
          <button class="mc-btn" data-act="settings">Options...</button>
          <button class="mc-btn" data-act="mode">Switch Game Mode</button>
        </div>
        <button class="mc-btn wide" data-act="quit">Save and Quit to Title</button>
      </div>
    `;
    this.root.appendChild(menu);
    menu.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.dataset.act === "resume") this.handles.onResume();
      else if (t.dataset.act === "quit") this.handles.onQuitToMenu();
      else if (t.dataset.act === "settings") this.showSettings();
      else if (t.dataset.act === "inv") { menu.remove(); this.showInventory(); }
      else if (t.dataset.act === "mode") { this.handles.onGameModeToggle(); }
      else if (t.dataset.act === "view") { this.handles.onToggleView?.(); }
    });
  }
  hidePauseMenu() {
    this.paused = false;
    const m = this.root.querySelector(".pause-root"); if (m) m.remove();
  }

  private cursorStack: ItemStack | null = null;
  private cursorEl!: HTMLElement;

  showInventory() {
    this.invOpen = true;
    if (this.root.querySelector(".inv-overlay")) return;
    const inv = this.inventory;
    const mode = this.modeEl.textContent || "";
    const isCreativeMode = mode.startsWith("CREATIVE");
    this.cursorStack = null;

    const overlay = document.createElement("div");
    overlay.className = "inv-overlay";
    overlay.innerHTML = `
      <div class="inv-panel">
        ${isCreativeMode ? this.renderCreativeTabs() : this.renderCraftingArea()}
        <div class="inv-label">${isCreativeMode ? "SELECT ITEMS (click to add a stack)" : "INVENTORY"}</div>
        <div class="inv-grid" data-part="main"></div>
        <div class="inv-label">HOTBAR</div>
        <div class="inv-grid" data-part="hotbar"></div>
        <div style="text-align:center; margin-top:8px; font-size:11px; color:#404040;">Press E or Esc to close</div>
      </div>
      <div class="cursor-item" style="position:absolute; pointer-events:none; z-index:200; display:none;">
        <img class="icon" style="width:32px;height:32px;image-rendering:pixelated;" />
        <div class="count" style="position:absolute;right:-4px;bottom:-4px;font-size:11px;color:#fff;text-shadow:1px 1px 0 #000;font-weight:bold;"></div>
      </div>
    `;
    this.root.appendChild(overlay);
    this.cursorEl = overlay.querySelector(".cursor-item") as HTMLElement;

    const mainGrid = overlay.querySelector('[data-part="main"]') as HTMLElement;
    const hotbarGrid = overlay.querySelector('[data-part="hotbar"]') as HTMLElement;
    const craftGrid = overlay.querySelector(".craft-grid") as HTMLElement | null;
    const craftResult = overlay.querySelector(".craft-result") as HTMLElement | null;

    // Track mouse for cursor item
    overlay.addEventListener("mousemove", (e) => {
      if (this.cursorEl) {
        this.cursorEl.style.left = `${e.clientX - 16}px`;
        this.cursorEl.style.top = `${e.clientY - 16}px`;
      }
    });

    const updateCursor = () => {
      if (!this.cursorStack) { this.cursorEl.style.display = "none"; return; }
      this.cursorEl.style.display = "block";
      const img = this.cursorEl.querySelector("img") as HTMLImageElement;
      img.src = this.iconFor(this.cursorStack.id) || "";
      const cnt = this.cursorEl.querySelector(".count") as HTMLElement;
      cnt.textContent = this.cursorStack.count > 1 ? String(this.cursorStack.count) : "";
    };

    const refreshSlotGrids = () => {
      mainGrid.innerHTML = ""; hotbarGrid.innerHTML = "";
      for (let i = 9; i < 36; i++) mainGrid.appendChild(this.makeInvSlot(i));
      for (let i = 0; i < 9; i++) hotbarGrid.appendChild(this.makeInvSlot(i));
    };

    // ---- Survival: interactive slots ----
    if (!isCreativeMode) {
      refreshSlotGrids();
      if (craftGrid && craftResult) {
        for (let i = 0; i < 9; i++) craftGrid.appendChild(this.makeCraftSlot(i, refreshSlotGrids, updateCursor));
        this.updateCraftResultSlot(craftResult, updateCursor, refreshSlotGrids);
        inv.updateCraftResult();
        this.updateCraftResultSlot(craftResult, updateCursor, refreshSlotGrids);
      }
    } else {
      // ---- Creative: palette + own inventory shown read-only-ish ----
      refreshSlotGrids();
      const firstTab = overlay.querySelector('.creative-tab') as HTMLElement;
      overlay.querySelectorAll<HTMLElement>(".creative-tab").forEach(t => t.addEventListener("click", () => {
        overlay.querySelectorAll(".creative-tab").forEach(x => x.classList.remove("active"));
        t.classList.add("active");
        const tab = CREATIVE_TABS.find(x => x.id === t.dataset.tab);
        const grid = overlay.querySelector(".creative-grid") as HTMLElement;
        grid.innerHTML = "";
        if (!tab) return;
        for (const id2 of tab.items) {
          const el = document.createElement("div");
          el.className = "inv-slot"; el.style.width = "36px"; el.style.height = "36px";
          el.innerHTML = `<img class="icon" src="${this.iconFor(id2)}" style="width:28px;height:28px;" />`;
          el.addEventListener("click", () => {
            const def = BLOCKS[id2]; if (!def) return;
            inv.addItem(id2, def.stackMax);
            this.renderHotbar();
            refreshSlotGrids();
          });
          el.addEventListener("mousemove", (e) => this.showTooltip(e, BLOCKS[id2]?.name));
          el.addEventListener("mouseleave", () => this.hideTooltip());
          grid.appendChild(el);
        }
      }));
      if (firstTab) firstTab.click();
    }

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this.closeInventory();
    });
    updateCursor();
  }

  // Build an interactive main/hotbar inventory slot.
  private makeInvSlot(idx: number): HTMLElement {
    const inv = this.inventory;
    const el = document.createElement("div");
    el.className = "inv-slot";
    const s = inv.slots[idx];
    this.decorateSlot(el, s);
    el.addEventListener("click", () => {
      const cur = inv.slots[idx];
      if (!this.cursorStack && cur) {
        // pick up
        this.cursorStack = cur; inv.slots[idx] = null;
      } else if (this.cursorStack && !cur) {
        inv.slots[idx] = this.cursorStack; this.cursorStack = null;
      } else if (this.cursorStack && cur) {
        if (cur.id === this.cursorStack.id) {
          const def = BLOCKS[cur.id];
          const space = def.stackMax - cur.count;
          const add = Math.min(space, this.cursorStack.count);
          cur.count += add; this.cursorStack.count -= add;
          if (this.cursorStack.count <= 0) this.cursorStack = null;
        } else {
          const tmp = cur; inv.slots[idx] = this.cursorStack; this.cursorStack = tmp;
        }
      }
      this.renderHotbar();
      // re-render this slot + cursor
      const parent = el.parentElement!;
      const newEl = this.makeInvSlot(idx);
      parent.replaceChild(newEl, el);
      this.updateInvCursorEl();
    });
    el.addEventListener("mousemove", (e) => this.showTooltip(e, s ? BLOCKS[s.id]?.name : undefined));
    el.addEventListener("mouseleave", () => this.hideTooltip());
    return el;
  }

  private makeCraftSlot(idx: number, refreshGrids: () => void, updateCursor: () => void): HTMLElement {
    const inv = this.inventory;
    const el = document.createElement("div");
    el.className = "inv-slot";
    this.decorateSlot(el, inv.craftSlots[idx]);
    el.addEventListener("click", () => {
      const cur = inv.craftSlots[idx];
      if (this.cursorStack) {
        // place one item
        if (!cur) {
          inv.craftSlots[idx] = { id: this.cursorStack.id, count: 1 };
          this.cursorStack.count -= 1;
          if (this.cursorStack.count <= 0) this.cursorStack = null;
        } else if (cur.id === this.cursorStack.id && cur.count < BLOCKS[cur.id].stackMax) {
          cur.count += 1; this.cursorStack.count -= 1;
          if (this.cursorStack.count <= 0) this.cursorStack = null;
        }
      } else if (cur) {
        // pick up whole stack
        this.cursorStack = cur; inv.craftSlots[idx] = null;
      }
      inv.updateCraftResult();
      // re-render craft grid + result
      const grid = el.parentElement!;
      grid.innerHTML = "";
      for (let i = 0; i < 9; i++) grid.appendChild(this.makeCraftSlot(i, refreshGrids, updateCursor));
      const resultEl = grid.parentElement!.querySelector(".craft-result") as HTMLElement;
      if (resultEl) this.updateCraftResultSlot(resultEl, updateCursor, refreshGrids);
      updateCursor();
    });
    el.addEventListener("mousemove", (e) => this.showTooltip(e, inv.craftSlots[idx] ? BLOCKS[inv.craftSlots[idx]!.id]?.name : undefined));
    el.addEventListener("mouseleave", () => this.hideTooltip());
    return el;
  }

  private updateCraftResultSlot(resultEl: HTMLElement, updateCursor: () => void, refreshGrids: () => void) {
    const inv = this.inventory;
    resultEl.innerHTML = "";
    resultEl.className = "craft-result";
    if (inv.craftResult) {
      resultEl.innerHTML = `<img class="icon" src="${this.iconFor(inv.craftResult.id)}" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:32px;height:32px;image-rendering:pixelated;" /><div class="count" style="position:absolute;right:2px;bottom:0;font-size:11px;color:#fff;text-shadow:1px 1px 0 #000;">${inv.craftResult.count>1?inv.craftResult.count:''}</div>`;
    }
    resultEl.onclick = () => {
      if (!inv.craftResult) return;
      const taken = inv.takeCraftResult();
      if (taken) {
        // put result into cursor or inventory
        if (!this.cursorStack) this.cursorStack = taken;
        else if (this.cursorStack.id === taken.id) this.cursorStack.count += taken.count;
        else inv.addItem(taken.id, taken.count);
        this.renderHotbar();
        refreshGrids();
        // re-render craft grid
        const grid = resultEl.parentElement!.querySelector(".craft-grid") as HTMLElement;
        if (grid) {
          grid.innerHTML = "";
          for (let i = 0; i < 9; i++) grid.appendChild(this.makeCraftSlot(i, refreshGrids, updateCursor));
        }
        this.updateCraftResultSlot(resultEl, updateCursor, refreshGrids);
        updateCursor();
      }
    };
  }

  private updateInvCursorEl() {
    // refresh the floating cursor item display
    if (!this.cursorEl) return;
    if (!this.cursorStack) { this.cursorEl.style.display = "none"; return; }
    this.cursorEl.style.display = "block";
    const img = this.cursorEl.querySelector("img") as HTMLImageElement;
    img.src = this.iconFor(this.cursorStack.id) || "";
    const cnt = this.cursorEl.querySelector(".count") as HTMLElement;
    cnt.textContent = this.cursorStack.count > 1 ? String(this.cursorStack.count) : "";
  }

  private decorateSlot(el: HTMLElement, s: ItemStack | null) {
    el.innerHTML = "";
    if (s && BLOCKS[s.id]) {
      el.innerHTML = `<img class="icon" src="${this.iconFor(s.id)}" /><div class="count">${s.count>1?s.count:''}</div>`;
    }
  }

  private renderCreativeTabs(): string {
    const tabs = CREATIVE_TABS;
    return `
      <div class="creative-tabs">
        ${tabs.map((t,i) => `<div class="creative-tab${i===0?' active':''}" data-tab="${t.id}" title="${t.label}">
          <img class="tab-icon" src="${this.iconFor(t.items[0]) || ""}" alt="${t.label}" />
        </div>`).join("")}
      </div>
      <div class="creative-grid"></div>
    `;
  }

  // Small pixel portrait of the character for the inventory screen.
  private portraitUrl?: string;
  makePortrait(): string {
    if (this.portraitUrl) return this.portraitUrl;
    const c = document.createElement("canvas");
    c.width = 32; c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const R = (x:number,y:number,w:number,h:number,col:string)=>{ctx.fillStyle=col;ctx.fillRect(x,y,w,h);};
    // head
    R(8, 0, 16, 16, "#d8a878"); R(8, 0, 16, 5, "#7a4a26"); R(8, 4, 3, 4, "#7a4a26"); R(21, 4, 3, 4, "#7a4a26");
    R(11, 8, 3, 2, "#ffffff"); R(18, 8, 3, 2, "#ffffff"); R(12, 8, 2, 2, "#3a5ac8"); R(18, 8, 2, 2, "#3a5ac8");
    R(14, 12, 4, 2, "#c89868");
    // torso
    R(8, 16, 16, 20, "#2a8a8a"); R(8, 16, 16, 2, "#5a3a20"); R(8, 33, 16, 3, "#5a3a20"); R(14, 34, 4, 2, "#d8b040");
    // arms
    R(2, 16, 6, 14, "#2a8a8a"); R(24, 16, 6, 14, "#2a8a8a"); R(2, 30, 6, 6, "#d8a878"); R(24, 30, 6, 6, "#d8a878");
    // legs
    R(9, 36, 6, 20, "#4a3626"); R(17, 36, 6, 20, "#4a3626");
    R(9, 56, 6, 6, "#2a2a2a"); R(17, 56, 6, 6, "#2a2a2a");
    this.portraitUrl = c.toDataURL("image/png");
    return this.portraitUrl;
  }

  private renderCraftingArea(): string {
    return `<div class="inv-top-row">
      <div class="player-col">
        <div class="armor-col">
          <div class="inv-slot mini" title="Helmet"></div>
          <div class="inv-slot mini" title="Chestplate"></div>
          <div class="inv-slot mini" title="Leggings"></div>
          <div class="inv-slot mini" title="Boots"></div>
        </div>
        <div class="player-portrait"><img src="${this.makePortrait()}" alt="" /></div>
      </div>
      <div class="inv-main-col">
        <div class="inv-label" style="text-align:left;">Crafting</div>
        <div class="crafting-area">
          <div class="craft-grid"></div>
          <div class="craft-arrow">→</div>
          <div class="craft-result"></div>
        </div>
      </div>
    </div>`;
  }

  private tooltipEl?: HTMLElement;
  private showTooltip(e: MouseEvent, text?: string) {
    if (!text) return this.hideTooltip();
    if (!this.tooltipEl) {
      this.tooltipEl = document.createElement("div");
      this.tooltipEl.className = "tooltip";
      this.root.appendChild(this.tooltipEl);
    }
    this.tooltipEl.textContent = text;
    this.tooltipEl.style.left = `${e.clientX + 14}px`;
    this.tooltipEl.style.top = `${e.clientY + 14}px`;
    this.tooltipEl.style.display = "block";
  }
  private hideTooltip() { if (this.tooltipEl) this.tooltipEl.style.display = "none"; }

  furnaceOpen = false;

  // ---- Boss bar ----
  showBossBar(name: string, pct: number) {
    let bar = this.root.querySelector(".boss-bar") as HTMLElement | null;
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "boss-bar";
      bar.style.cssText = "position:absolute;top:60px;left:50%;transform:translateX(-50%);width:320px;text-align:center;pointer-events:none;";
      bar.innerHTML = `<div style="color:#d0a0ff;font-size:13px;letter-spacing:0.2em;text-shadow:1px 1px 0 #000;margin-bottom:3px;">${name}</div>
        <div style="height:10px;background:#2a0a2a;border:2px solid #4a1a4a;"><div class="boss-fill" style="height:100%;background:linear-gradient(90deg,#8a2ae0,#d060ff);width:100%;transition:width 0.2s;"></div></div>`;
      this.root.appendChild(bar);
    }
    const fill = bar.querySelector(".boss-fill") as HTMLElement;
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }
  hideBossBar() {
    const bar = this.root.querySelector(".boss-bar"); if (bar) bar.remove();
  }

  // ---- Furnace UI ----
  showFurnace(fs: FurnaceState) {
    if (this.furnaceOpen) return;
    this.furnaceOpen = true;
    const inv = this.inventory;
    this.cursorStack = null;
    const overlay = document.createElement("div");
    overlay.className = "inv-overlay";
    overlay.innerHTML = `
      <div class="inv-panel" style="min-width:360px;">
        <div class="inv-label">FURNACE</div>
        <div style="display:flex; align-items:center; justify-content:center; gap:14px; margin-bottom:10px;">
          <div style="display:flex; flex-direction:column; align-items:center; gap:6px;">
            <div class="inv-slot" data-fslot="input"></div>
            <div class="fire-gauge" style="width:20px;height:20px;"></div>
            <div class="inv-slot" data-fslot="fuel"></div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            <div class="progress-track" style="width:80px;height:12px;background:#5a5a5a;border:2px solid #373737;"><div class="progress-fill" style="height:100%;width:0%;background:#e8a03c;"></div></div>
          </div>
          <div class="inv-slot" data-fslot="output" style="width:52px;height:52px;"></div>
        </div>
        <div class="inv-label">INVENTORY</div>
        <div class="inv-grid" data-part="main"></div>
        <div class="inv-label">HOTBAR</div>
        <div class="inv-grid" data-part="hotbar"></div>
        <div style="text-align:center; margin-top:8px; font-size:11px; color:#404040;">Press E or Esc to close</div>
      </div>
      <div class="cursor-item" style="position:absolute; pointer-events:none; z-index:200; display:none;">
        <img class="icon" style="width:32px;height:32px;image-rendering:pixelated;" />
        <div class="count" style="position:absolute;right:-4px;bottom:-4px;font-size:11px;color:#fff;text-shadow:1px 1px 0 #000;font-weight:bold;"></div>
      </div>
    `;
    this.root.appendChild(overlay);
    this.cursorEl = overlay.querySelector(".cursor-item") as HTMLElement;
    const inputEl = overlay.querySelector('[data-fslot="input"]') as HTMLElement;
    const fuelEl = overlay.querySelector('[data-fslot="fuel"]') as HTMLElement;
    const outputEl = overlay.querySelector('[data-fslot="output"]') as HTMLElement;
    const mainGrid = overlay.querySelector('[data-part="main"]') as HTMLElement;
    const hotbarGrid = overlay.querySelector('[data-part="hotbar"]') as HTMLElement;
    const progressFill = overlay.querySelector(".progress-fill") as HTMLElement;
    const fireGauge = overlay.querySelector(".fire-gauge") as HTMLElement;

    overlay.addEventListener("mousemove", (e) => {
      if (this.cursorEl) { this.cursorEl.style.left = `${e.clientX - 16}px`; this.cursorEl.style.top = `${e.clientY - 16}px`; }
    });

    const updateCursor = () => this.updateInvCursorEl();
    const decorateFSlot = (el: HTMLElement, s: ItemStack | null) => this.decorateSlot(el, s);

    const bindFSlot = (el: HTMLElement, which: "input"|"fuel"|"output") => {
      el.addEventListener("click", () => {
        if (which === "output") {
          const out = fs.output;
          if (out && !this.cursorStack) { this.cursorStack = { ...out }; fs.output = null; }
          else if (out && this.cursorStack && this.cursorStack.id === out.id) { this.cursorStack.count += out.count; fs.output = null; }
        } else {
          const cur = fs[which];
          if (!this.cursorStack && cur) { this.cursorStack = cur; fs[which] = null; }
          else if (this.cursorStack && !cur) { fs[which] = this.cursorStack; this.cursorStack = null; }
          else if (this.cursorStack && cur) {
            if (cur.id === this.cursorStack.id) {
              const space = BLOCKS[cur.id].stackMax - cur.count;
              const add = Math.min(space, this.cursorStack.count);
              cur.count += add; this.cursorStack.count -= add;
              if (this.cursorStack.count <= 0) this.cursorStack = null;
            } else { const tmp = cur; fs[which] = this.cursorStack; this.cursorStack = tmp; }
          }
        }
        redraw();
      });
    };
    bindFSlot(inputEl, "input");
    bindFSlot(fuelEl, "fuel");
    bindFSlot(outputEl, "output");

    const refreshInv = () => {
      mainGrid.innerHTML = ""; hotbarGrid.innerHTML = "";
      for (let i = 9; i < 36; i++) mainGrid.appendChild(this.makeInvSlot(i));
      for (let i = 0; i < 9; i++) hotbarGrid.appendChild(this.makeInvSlot(i));
    };

    const redraw = () => {
      decorateFSlot(inputEl, fs.input);
      decorateFSlot(fuelEl, fs.fuel);
      decorateFSlot(outputEl, fs.output);
      refreshInv();
      this.renderHotbar();
      updateCursor();
    };

    // live progress update
    const interval = setInterval(() => {
      if (!this.furnaceOpen) { clearInterval(interval); return; }
      const pct = Math.min(100, (fs.progress / SMELT_TIME) * 100);
      progressFill.style.width = pct + "%";
      const burning = fs.burnTime > 0;
      fireGauge.innerHTML = burning ? '<div style="width:16px;height:16px;margin:2px;background:#ff7818;clip-path:polygon(50% 0%,80% 30%,100% 60%,70% 100%,30% 100%,0% 60%,20% 30%);"></div>' : '';
    }, 120);

    redraw();
    overlay.addEventListener("click", (e) => { if (e.target === overlay) this.closeFurnace(); });
  }

  chestOpen = false;

  // ---- Chest UI ----
  showChest(chestSlots: (ItemStack | null)[]) {
    if (this.chestOpen) return;
    this.chestOpen = true;
    this.cursorStack = null;
    const overlay = document.createElement("div");
    overlay.className = "inv-overlay";
    overlay.innerHTML = `
      <div class="inv-panel">
        <div class="inv-label">CHEST</div>
        <div class="inv-grid" data-part="chest" style="grid-template-columns:repeat(9,44px);"></div>
        <div class="inv-label">INVENTORY</div>
        <div class="inv-grid" data-part="main"></div>
        <div class="inv-label">HOTBAR</div>
        <div class="inv-grid" data-part="hotbar"></div>
        <div style="text-align:center; margin-top:8px; font-size:11px; color:#404040;">Press E or Esc to close</div>
      </div>
      <div class="cursor-item" style="position:absolute; pointer-events:none; z-index:200; display:none;">
        <img class="icon" style="width:32px;height:32px;image-rendering:pixelated;" />
        <div class="count" style="position:absolute;right:-4px;bottom:-4px;font-size:11px;color:#fff;text-shadow:1px 1px 0 #000;font-weight:bold;"></div>
      </div>
    `;
    this.root.appendChild(overlay);
    this.cursorEl = overlay.querySelector(".cursor-item") as HTMLElement;
    const chestGrid = overlay.querySelector('[data-part="chest"]') as HTMLElement;
    const mainGrid = overlay.querySelector('[data-part="main"]') as HTMLElement;
    const hotbarGrid = overlay.querySelector('[data-part="hotbar"]') as HTMLElement;

    overlay.addEventListener("mousemove", (e) => {
      if (this.cursorEl) { this.cursorEl.style.left = `${e.clientX - 16}px`; this.cursorEl.style.top = `${e.clientY - 16}px`; }
    });

    const makeChestSlot = (idx: number): HTMLElement => {
      const el = document.createElement("div");
      el.className = "inv-slot";
      this.decorateSlot(el, chestSlots[idx]);
      el.addEventListener("click", () => {
        const cur = chestSlots[idx];
        if (!this.cursorStack && cur) { this.cursorStack = cur; chestSlots[idx] = null; }
        else if (this.cursorStack && !cur) { chestSlots[idx] = this.cursorStack; this.cursorStack = null; }
        else if (this.cursorStack && cur) {
          if (cur.id === this.cursorStack.id) {
            const space = BLOCKS[cur.id].stackMax - cur.count;
            const add = Math.min(space, this.cursorStack.count);
            cur.count += add; this.cursorStack.count -= add;
            if (this.cursorStack.count <= 0) this.cursorStack = null;
          } else { const tmp = cur; chestSlots[idx] = this.cursorStack; this.cursorStack = tmp; }
        }
        redraw();
      });
      el.addEventListener("mousemove", (e) => this.showTooltip(e, chestSlots[idx] ? BLOCKS[chestSlots[idx]!.id]?.name : undefined));
      el.addEventListener("mouseleave", () => this.hideTooltip());
      return el;
    };

    const redraw = () => {
      chestGrid.innerHTML = "";
      for (let i = 0; i < chestSlots.length; i++) chestGrid.appendChild(makeChestSlot(i));
      mainGrid.innerHTML = ""; hotbarGrid.innerHTML = "";
      for (let i = 9; i < 36; i++) mainGrid.appendChild(this.makeInvSlot(i));
      for (let i = 0; i < 9; i++) hotbarGrid.appendChild(this.makeInvSlot(i));
      this.renderHotbar();
      this.updateInvCursorEl();
    };
    redraw();
    overlay.addEventListener("click", (e) => { if (e.target === overlay) this.closeChest(); });
  }

  closeChest() {
    if (!this.chestOpen) return;
    this.chestOpen = false;
    if (this.cursorStack && this.inventory) {
      this.inventory.addItem(this.cursorStack.id, this.cursorStack.count);
      this.cursorStack = null;
      this.renderHotbar();
    }
    const o = this.root.querySelector(".inv-overlay"); if (o) o.remove();
    this.hideTooltip();
  }

  closeFurnace() {
    if (!this.furnaceOpen) return;
    this.furnaceOpen = false;
    // return cursor to inventory
    if (this.cursorStack && this.inventory) {
      this.inventory.addItem(this.cursorStack.id, this.cursorStack.count);
      this.cursorStack = null;
      this.renderHotbar();
    }
    const o = this.root.querySelector(".inv-overlay"); if (o) o.remove();
    this.hideTooltip();
  }

  closeInventory() {
    this.invOpen = false;
    // return crafting grid and cursor items to inventory
    if (this.inventory) {
      this.inventory.returnCraftGrid();
      if (this.cursorStack) {
        this.inventory.addItem(this.cursorStack.id, this.cursorStack.count);
        this.cursorStack = null;
      }
      this.renderHotbar();
    }
    const o = this.root.querySelector(".inv-overlay"); if (o) o.remove();
    this.hideTooltip();
  }

  showDeathScreen(respawn: () => void) {
    if (this.root.querySelector(".death-screen")) return;
    const ds = document.createElement("div");
    ds.className = "death-screen";
    ds.innerHTML = `
      <h1>YOU DIED</h1>
      <div class="score">Score: 0</div>
      <button class="mc-btn primary" data-act="respawn">RESPAWN</button>
    `;
    this.root.appendChild(ds);
    ds.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).dataset.act === "respawn") { ds.remove(); respawn(); }
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]!));
}
