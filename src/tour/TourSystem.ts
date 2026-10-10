import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { VoxelWorld } from '../world/World';
import { BIOMES, biomeAt } from '../world/biomes';
import { surfaceHeight } from '../world/generator';
import { volcanoNear } from '../world/structures';

export interface TourStop {
  title: string;
  subtitle: string;
  position: Vector3;
  lookAt: Vector3;
  biomeId?: string;
}

const BIOME_NOTES: Record<string, string> = {
  plains: 'Wildflowers ripple across the open grassland.',
  woodland: 'A broadleaf canopy gathers around the old paths.',
  birch: 'Pale trunks and a quiet, bright forest floor.',
  taiga: 'Evergreen needles frame the cold northern light.',
  snow: 'The tundra keeps its own spare, silent beauty.',
  peaks: 'Stone spires rise above the clouds.',
  desert: 'Wind-carved dunes conceal traces of older worlds.',
  badlands: 'Layered earth catches the last warmth of the sun.',
  savanna: 'Open grasslands stretch beneath scattered acacia.',
  cherry: 'Blossom-colored leaves drift through the valley.',
  mushroom: 'Towering fungi make a forest of their own.',
  toxic: 'Bright water warns you to keep your distance.',
  bones: 'Ancient remains emerge from the dry earth.',
  marsh: 'Still water and moss soften the lowland.',
  mangrove: 'Roots wind through a shifting tidal forest.',
  jungle: 'Dense leaves close around the emerald canopy.',
  meadow: 'High grasslands open onto distant ridgelines.',
  volcanic: 'A living crater glows beneath the ash.',
  lavender: 'Soft violet fields follow the rolling hills.',
  aspen: 'Golden crowns gather in the mountain air.',
  redwood: 'Old cedar giants hold the forest shade.',
  ocean: 'Deep water reaches beyond the visible horizon.',
  beach: 'The tide draws a bright border around the land.',
  reef: 'Coral color shimmers beneath the shallow water.',
  glacier: 'Blue ice and pale stone catch the high light.',
  crag: 'Wind-cut ridges break across the skyline.',
  darkwood: 'A dim, tangled forest hides the ground below.',
  crystal: 'Amethyst formations scatter color across the plain.',
  clay: 'Smooth mineral terraces contour the basin.',
  willow: 'Long branches trail over the wetland pools.',
  autumn: 'Maple foliage turns the hillside to copper.',
  silver: 'Cool leaves brighten this sheltered glade.',
};

const TOUR_RADIUS = 36_000;
const SEARCH_STEP = 192;
const SHOT_SECONDS = 6.8;

export class TourSystem {
  active = false;
  loading = false;
  private stops: TourStop[] = [];
  private index = 0;
  private timer = 0;
  private transitionId = 0;

  onCaption?: (stop: TourStop, index: number, total: number) => void;
  onLoading?: (active: boolean, progress: number, label: string) => void;
  onArrival?: (stop: TourStop, index: number, total: number) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;

  constructor(private camera: FreeCamera, private world: VoxelWorld) {}

  /** The stream must follow the destination while chunks are being prepared. */
  get streamPosition(): Vector3 {
    if (this.loading && this.stops[this.index]) return this.stops[this.index].lookAt;
    return this.camera.position;
  }

  private locateAllBiomes(): Promise<Map<string, { x: number; z: number }>> {
    const found = new Map<string, { x: number; z: number }>();
    const wanted = new Set(BIOMES.map(biome => biome.id));
    const seed = this.world.config.seed;
    let radius = 0;

    const sample = (x: number, z: number) => {
      const height = surfaceHeight(x, z, this.world.config);
      const biome = biomeAt(x, z, seed, 'overworld', height);
      if (wanted.has(biome.id) && !found.has(biome.id)) found.set(biome.id, { x, z });
    };

    return new Promise(resolve => {
      const scanRing = () => {
        const ringsPerFrame = SEARCH_STEP * 4;
        const stopAt = Math.min(TOUR_RADIUS, radius + ringsPerFrame);
        for (; radius <= stopAt; radius += SEARCH_STEP) {
          if (radius === 0) {
            sample(2, -4);
            continue;
          }
          for (let x = -radius; x <= radius; x += SEARCH_STEP) {
            sample(x, -radius);
            sample(x, radius);
          }
          for (let z = -radius + SEARCH_STEP; z < radius; z += SEARCH_STEP) {
            sample(-radius, z);
            sample(radius, z);
          }
          if (found.size === wanted.size) break;
        }
        const progress = Math.min(0.72, radius / TOUR_RADIUS * 0.72);
        this.onLoading?.(true, progress, `Mapping the Overworld · ${found.size}/${wanted.size} biomes`);
        if (found.size === wanted.size || radius > TOUR_RADIUS || !this.active) {
          resolve(found);
          return;
        }
        window.setTimeout(scanRing, 0);
      };
      scanRing();
    });
  }

  private makeStop(title: string, subtitle: string, x: number, z: number, height = 20, distance = 26, biomeId?: string): TourStop {
    const ground = this.world.isLoaded(x, z)
      ? this.world.ground(x, z)
      : surfaceHeight(x, z, this.world.config) + 1;
    const eye = new Vector3(x, ground + 1, z);
    return {
      title,
      subtitle,
      biomeId,
      position: new Vector3(x + distance * 0.62, ground + height, z - distance * 0.78),
      lookAt: eye,
    };
  }

  private buildRoute(locations: Map<string, { x: number; z: number }>) {
    const seed = this.world.config.seed;
    this.stops = BIOMES.map(biome => {
      const location = locations.get(biome.id);
      if (!location) {
        // Be transparent if an unusually constrained seed/preset cannot produce a biome.
        return this.makeStop(`${biome.name} · not found in this seed`, 'This world did not generate a sample location for this biome.', 2, -4, 20, 26, biome.id);
      }
      let { x, z } = location;
      if (biome.id === 'volcanic') {
        const vent = volcanoNear(x, z, seed, 420);
        if (vent && biomeAt(vent.x, vent.z, seed, 'overworld', surfaceHeight(vent.x, vent.z, this.world.config)).id === 'volcanic') {
          x = vent.x;
          z = vent.z;
        }
      }
      const height = ['ocean', 'reef', 'beach'].includes(biome.id) ? 28
        : ['peaks', 'glacier', 'crag'].includes(biome.id) ? 30
          : biome.id === 'volcanic' ? 34 : 21;
      const distance = biome.id === 'volcanic' ? 38 : ['ocean', 'reef'].includes(biome.id) ? 34 : 26;
      return this.makeStop(biome.name, BIOME_NOTES[biome.id] || `A closer look at the ${biome.name.toLowerCase()}.`, x, z, height, distance, biome.id);
    });

    // Two additional landmarks preserve the original route's village and ancient-city reveal.
    this.stops.push(this.makeStop('Riverside Village', 'A quiet pause among the homes, gardens, and old paths.', 21, 6, 17, 25));
    this.stops.push(this.makeStop('Ancient Stairs', 'C, G, E, B, C. The deep gate remembers the melody.', 42, -52, 17, 22));
  }

  async start() {
    if (this.active) return;
    this.active = true;
    this.loading = true;
    this.transitionId++;
    this.onLoading?.(true, 0, 'Mapping every Overworld biome');
    const locations = await this.locateAllBiomes();
    if (!this.active) return;
    this.buildRoute(locations);
    this.index = 0;
    this.timer = 0;
    await this.enterStop(0);
  }

  stopTour() {
    if (!this.active) return;
    this.active = false;
    this.loading = false;
    this.transitionId++;
    this.stops = [];
    this.onLoading?.(false, 1, '');
    this.onEnd?.();
  }

  async next() {
    if (!this.active || this.loading) return;
    const nextIndex = this.index + 1;
    if (nextIndex >= this.stops.length) {
      this.stopTour();
      return;
    }
    await this.enterStop(nextIndex);
  }

  private async enterStop(index: number) {
    if (!this.active) return;
    this.index = index;
    this.timer = 0;
    this.loading = true;
    const stop = this.stops[index];
    const total = this.stops.length;
    const transition = ++this.transitionId;
    this.onCaption?.(stop, index + 1, total);
    this.onLoading?.(true, 0, `Preparing ${stop.title}`);

    try {
      await this.world.waitForSpawn(
        stop.lookAt.x,
        stop.lookAt.z,
        progress => {
          if (this.active && transition === this.transitionId) {
            this.onLoading?.(true, 0.72 + progress * 0.28, `Generating terrain · ${Math.round(progress * 100)}%`);
          }
        },
        () => !this.active || transition !== this.transitionId,
      );
    } catch (error) {
      if (!this.active || transition !== this.transitionId) return;
      this.onError?.(error instanceof Error ? error.message : 'The cinematic tour could not load this location.');
      this.stopTour();
      return;
    }
    if (!this.active || transition !== this.transitionId) return;

    this.camera.position.copyFrom(stop.position);
    this.camera.setTarget(stop.lookAt);
    this.world.stream(stop.lookAt.x, stop.lookAt.z);
    this.loading = false;
    this.timer = 0;
    this.onLoading?.(false, 1, '');
    this.onArrival?.(stop, index + 1, total);
  }

  update(dt: number) {
    if (!this.active || this.loading || !this.stops.length) return;
    this.timer += dt;
    const stop = this.stops[this.index];
    const angle = this.timer * 0.17;
    const ease = Math.min(1, this.timer / 1.2);
    this.camera.position.set(
      stop.position.x + Math.sin(angle) * 1.65 * ease,
      stop.position.y + Math.sin(angle * 0.68) * 0.55 * ease,
      stop.position.z + Math.cos(angle) * 1.65 * ease,
    );
    this.camera.setTarget(stop.lookAt);
    if (this.timer >= SHOT_SECONDS) void this.next();
  }
}
