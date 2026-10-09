import "./style.css";
import { Game } from "./core/game";

async function main() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  if (!canvas) throw new Error("renderCanvas not found");
  const game = new Game(canvas);
  await game.init();
  game.runLoop();
  (window as any).__game = game;
}

main().catch(err => {
  console.error("[Mass Awakening] Fatal error during init:", err);
  const root = document.getElementById("ui-root");
  if (root) {
    root.innerHTML = `<div style="color:#ff6060;padding:24px;font-family:monospace;">
      <h2>Game failed to start</h2><pre style="white-space:pre-wrap;">${(err as Error).message}\n${(err as Error).stack}</pre></div>`;
  }
});
