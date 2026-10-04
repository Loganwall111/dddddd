/* Launcher hub — pick one of the three products in this repo. */
export function Hub({ onPick }: { onPick: (p: "editor" | "game" | "lumital") => void }) {
  return (
    <div className="hub-root">
      <div className="hub-bg" aria-hidden="true" />
      <header className="hub-head">
        <span className="forge-logo big">◈ ENTER&nbsp;THE&nbsp;SIFT</span>
        <p>original rift-dimension toolkit · two engines, one asset set</p>
      </header>
      <div className="hub-cards">
        <button className="hub-card" onClick={() => onPick("editor")}>
          <div className="hub-art hub-art-editor" aria-hidden="true">
            <i className="a1" /><i className="a2" /><i className="a3" /><i className="a4" />
          </div>
          <h2>SIFT FORGE</h2>
          <span className="hub-kind">PROJECT 01 · ASSET &amp; SCENE ENGINE</span>
          <p>Unreal-class dark editor. 100+ authored blocks, 12 animated creatures, rift portals, VFX, preset landmark scenes — export to GLB / OBJ / JSON / Fabric Minecraft packs.</p>
          <em>OPEN EDITOR →</em>
        </button>
        <button className="hub-card" onClick={() => onPick("game")}>
          <div className="hub-art hub-art-game" aria-hidden="true">
            <i className="g1" /><i className="g2" /><i className="g3" />
          </div>
          <h2>SIFT REALMS</h2>
          <span className="hub-kind">PROJECT 02 · PLAYABLE 3D ADVENTURE</span>
          <p>Third-person rift travel across three realms — Singer Meadow, Rose Spires, the Boneyard. Recover 12 resonance notes, dodge the sculk, awaken the ritual portal.</p>
          <em>PLAY →</em>
        </button>
        <button className="hub-card dim" onClick={() => onPick("lumital")}>
          <div className="hub-art hub-art-lumital" aria-hidden="true"><i /></div>
          <h2>LUMITAL</h2>
          <span className="hub-kind">LEGACY · LIVING REALITY ENGINE</span>
          <p>The original cross-scale expedition prototype preserved in this repository.</p>
          <em>OPEN →</em>
        </button>
      </div>
      <footer className="hub-foot">
        assets · textures · creatures · sounds — from this repository's original Sift dimension (fabric-mod) · shaders &amp; VFX rendered live in WebGL
      </footer>
    </div>
  );
}
