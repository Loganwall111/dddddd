// Blocky humanoid character model built from UV-mapped boxes using the
// procedural humanoid skin. Used for third-person view and remote players.
import { Scene, Vector3, Mesh, MeshBuilder, TransformNode, StandardMaterial, DynamicTexture, Color3, Color4 } from "@babylonjs/core";
import { HumanoidSkinPack, remapBoxUVs } from "./skins";

export class HumanoidModel {
  root: TransformNode;
  private armL: TransformNode; private armR: TransformNode;
  private legL: TransformNode; private legR: TransformNode;
  private meshes: Mesh[] = [];
  private walkPhase = 0;

  constructor(scene: Scene, skin: HumanoidSkinPack, nameTag?: string) {
    this.root = new TransformNode("humanoid", scene);
    const M = (w: number, h: number, d: number, tile: number): Mesh => {
      const m = MeshBuilder.CreateBox("part", { width: w, height: h, depth: d }, scene);
      remapBoxUVs(m, tile, skin.atlasW, skin.atlasH);
      m.material = skin.material;
      m.isPickable = false;
      this.meshes.push(m);
      return m;
    };
    const P = (name: string, y: number): TransformNode => {
      const n = new TransformNode(name, scene);
      n.parent = this.root; n.position.y = y;
      return n;
    };

    // legs (pivot at hip y=0.75)
    this.legL = P("legL", 0.75); this.legR = P("legR", 0.75);
    const legM1 = M(0.24, 0.75, 0.24, skin.tiles.leg); legM1.parent = this.legL; legM1.position.set(0, -0.375, 0);
    const legM2 = M(0.24, 0.75, 0.24, skin.tiles.leg); legM2.parent = this.legR; legM2.position.set(0, -0.375, 0);
    this.legL.position.x = -0.14; this.legR.position.x = 0.14;

    // torso
    const torso = M(0.5, 0.72, 0.26, skin.tiles.torso);
    torso.parent = this.root; torso.position.y = 0.75 + 0.36;

    // arms (pivot at shoulder y=1.42)
    this.armL = P("armL", 1.42); this.armR = P("armR", 1.42);
    const armM1 = M(0.22, 0.7, 0.22, skin.tiles.arm); armM1.parent = this.armL; armM1.position.set(0, -0.32, 0);
    const armM2 = M(0.22, 0.7, 0.22, skin.tiles.arm); armM2.parent = this.armR; armM2.position.set(0, -0.32, 0);
    this.armL.position.x = -0.37; this.armR.position.x = 0.37;

    // head
    const head = MeshBuilder.CreateBox("head", { size: 0.5 }, scene);
    // give the head a proper face on +Z: build with 6 materials? simpler: remap all to face, sides show face too.
    remapBoxUVs(head, skin.tiles.head_face, skin.atlasW, skin.atlasH);
    head.material = skin.material;
    head.isPickable = false;
    head.parent = this.root; head.position.y = 1.47 + 0.25;
    this.meshes.push(head);

    if (nameTag) {
      const tag = this.makeNameTag(scene, nameTag);
      tag.parent = this.root; tag.position.y = 2.15;
    }
  }

  private makeNameTag(scene: Scene, name: string): Mesh {
    const dt = new DynamicTexture("nametag", { width: 128, height: 32 } as any, scene, false);
    const ctx = dt.getContext() as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, 128, 32);
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(name.slice(0, 14), 64, 17);
    dt.update(false);
    dt.hasAlpha = true;
    const m = MeshBuilder.CreatePlane("nametag", { width: 1.1, height: 0.275 }, scene);
    const mat = new StandardMaterial("nametagmat", scene);
    mat.diffuseTexture = dt; mat.emissiveColor = new Color3(1, 1, 1);
    mat.disableLighting = true; mat.useAlphaFromDiffuseTexture = true;
    mat.backFaceCulling = false;
    m.material = mat; m.isPickable = false;
    m.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.meshes.push(m);
    return m;
  }

  setWalking(moving: boolean, dt: number) {
    if (moving) this.walkPhase += dt * 9; 
    const s = moving ? Math.sin(this.walkPhase) * 0.6 : 0;
    this.legL.rotation.x = s; this.legR.rotation.x = -s;
    this.armL.rotation.x = -s * 0.8; this.armR.rotation.x = s * 0.8;
  }

  swingArm(t: number) {
    // mining swing for third person: right arm arcs
    this.armR.rotation.x = -1.2 + Math.sin(t * 18) * 0.5;
  }

  setVisible(v: boolean) { for (const m of this.meshes) m.isVisible = v; this.root.getChildren().forEach(n => { (n as any).isVisible = v; }); }

  setPosition(x: number, y: number, z: number, yaw: number) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
  }

  dispose() { this.root.dispose(false, true); }
}

// Simple first-person viewmodel arm attached to the camera.
export class FirstPersonArm {
  root: TransformNode;
  private mesh: Mesh;
  swing = 0;

  constructor(scene: Scene, skin: HumanoidSkinPack, cameraMeshParent: { position: Vector3 }) {
    this.root = new TransformNode("fpArm", scene);
    this.mesh = MeshBuilder.CreateBox("fpArmMesh", { width: 0.16, height: 0.16, depth: 0.62 }, scene);
    remapBoxUVs(this.mesh, skin.tiles.arm, skin.atlasW, skin.atlasH);
    this.mesh.material = skin.material;
    this.mesh.isPickable = false;
    this.mesh.parent = this.root;
    this.mesh.position.set(0, 0, 0.28);
    this.mesh.rotation.x = 0.15;
  }

  attachToCamera(camera: { position: Vector3; getDirection?: (v: Vector3) => Vector3; getForwardRay?: () => { direction: Vector3 }; getRightVector?: () => Vector3; getUpVector?: () => Vector3 }) {
    // Position the arm relative to the camera each frame (called from update)
    const cam = camera as any;
    const fwd = cam.getForwardRay().direction as Vector3;
    const right = (cam.getDirection ? (cam.getDirection(new Vector3(1, 0, 0)) as Vector3) : Vector3.Cross(Vector3.Up(), fwd).normalize()).normalize();
    const up = Vector3.Cross(fwd, right).normalize();
    const pos = cam.position.add(right.scale(0.42)).add(up.scale(-0.42)).add(fwd.scale(0.5));
    this.root.position.copyFrom(pos);
    this.root.rotation.y = Math.atan2(fwd.x, fwd.z);
    const swing = this.swing > 0 ? Math.sin((1 - this.swing) * Math.PI) * 0.9 : 0;
    this.root.rotation.x = -0.5 + swing;
  }

  setVisible(v: boolean) { this.root.getChildren().forEach(n => (n as any).isVisible = v); this.root.isVisible = v; }
  tick(dt: number) { this.swing = Math.max(0, this.swing - dt * 4); }
  dispose() { this.root.dispose(false, true); }
}
