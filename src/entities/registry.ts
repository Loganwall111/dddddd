export interface MobDefinition { name: string; body: string; accent: string; model: 'quadruped' | 'humanoid' | 'bird' | 'dragon' | 'wither' | 'spider' | 'fish' | 'slime' | 'sniffer'; hostile: boolean; health: number; speed: number; scale: number; flying?: boolean; aquatic?: boolean; seaLife?: boolean; boss?: boolean; }
export const MOBS: Record<string, MobDefinition> = {
  sheep: { name: 'Sheep', body: '#dedaca', accent: '#8f8971', model: 'quadruped', hostile: false, health: 10, speed: .55, scale: 1 },
  cow: { name: 'Meadow Cow', body: '#694c36', accent: '#eee9d5', model: 'quadruped', hostile: false, health: 14, speed: .5, scale: 1.12 },
  pig: { name: 'Pig', body: '#d69b99', accent: '#b76d76', model: 'quadruped', hostile: false, health: 10, speed: .7, scale: .85 },
  fox: { name: 'Red Fox', body: '#c47b3c', accent: '#f3d5a6', model: 'quadruped', hostile: false, health: 9, speed: 1.3, scale: .65 },
  wolf: { name: 'Timber Wolf', body: '#a4a99d', accent: '#666c67', model: 'quadruped', hostile: false, health: 18, speed: 1, scale: .82 },
  rabbit: { name: 'Rabbit', body: '#b5a088', accent: '#e0cab6', model: 'quadruped', hostile: false, health: 5, speed: 1.25, scale: .4 },
  chicken: { name: 'Chicken', body: '#eee9d9', accent: '#bc5a48', model: 'bird', hostile: false, health: 6, speed: .65, scale: .8 },
  bird: { name: 'Sky Gull', body: '#dadfcf', accent: '#968958', model: 'bird', hostile: false, health: 4, speed: 2, scale: 1, flying: true },
  fish: { name: 'River Trout', body: '#82aaa0', accent: '#d7b78b', model: 'fish', hostile: false, health: 4, speed: 1.3, scale: .7, aquatic: true },
  squid: { name: 'Indigo Squid', body: '#3f5c79', accent: '#a1bbc3', model: 'spider', hostile: false, health: 10, speed: .7, scale: .7, aquatic: true },
  shade: { name: 'Zombie', body: '#738563', accent: '#4a6985', model: 'humanoid', hostile: true, health: 20, speed: 1.7, scale: 1 },
  skeleton: { name: 'Skeleton Archer', body: '#d3cbb4', accent: '#5d594e', model: 'humanoid', hostile: true, health: 16, speed: 1.5, scale: .94 },
  creeper: { name: 'Moss Creeper', body: '#6d9756', accent: '#354b33', model: 'humanoid', hostile: true, health: 18, speed: 1.5, scale: .84 },
  spider: { name: 'Cave Spider', body: '#4e433b', accent: '#ba625e', model: 'spider', hostile: true, health: 14, speed: 2.5, scale: 1 },
  endling: { name: 'Tall Endling', body: '#332a41', accent: '#c994f0', model: 'humanoid', hostile: true, health: 32, speed: 2.1, scale: 1.4 },
  villager: { name: 'Villager', body: '#a48564', accent: '#826a48', model: 'humanoid', hostile: false, health: 20, speed: .45, scale: 1 },
  sniffer: { name: 'Moss Sniffer', body: '#70965c', accent: '#a26d48', model: 'sniffer', hostile: false, health: 24, speed: .38, scale: 1.2 },
  slime: { name: 'Slime', body: '#90c47b', accent: '#335b40', model: 'slime', hostile: true, health: 12, speed: 1.2, scale: 1 },
  ember: { name: 'Ember Sentinel', body: '#925c40', accent: '#efa75c', model: 'humanoid', hostile: true, health: 24, speed: 1.4, scale: 1.05 },
  spirit: { name: 'Sift Moth', body: '#9ed5aa', accent: '#d4798e', model: 'bird', hostile: true, health: 16, speed: 2, scale: 1.4, flying: true },
  dragon: { name: 'Rift Dragon', body: '#3a304e', accent: '#a682c1', model: 'dragon', hostile: true, health: 160, speed: 3, scale: 1, flying: true, boss: true },
  wither: { name: 'Ash Wither', body: '#48434f', accent: '#84dad1', model: 'wither', hostile: true, health: 130, speed: 2, scale: 1, flying: true, boss: true },
  warden: { name: 'Cinder Warden', body: '#51464d', accent: '#e1a16c', model: 'humanoid', hostile: true, health: 140, speed: 1, scale: 2.1, boss: true },
  'sea-clownfish': { name: 'Clownfish', body: '#f0822f', accent: '#fff4e6', model: 'fish', hostile: false, health: 3, speed: 1.4, scale: .45, aquatic: true, seaLife: true },
  'sea-tang': { name: 'Blue Tang', body: '#2b6fd6', accent: '#f2d13c', model: 'fish', hostile: false, health: 4, speed: 1.4, scale: .55, aquatic: true, seaLife: true },
  'sea-angelfish': { name: 'Angelfish', body: '#e9e6c7', accent: '#ef9d3d', model: 'fish', hostile: false, health: 4, speed: 1.2, scale: .6, aquatic: true, seaLife: true },
  'sea-parrotfish': { name: 'Parrotfish', body: '#4fb08c', accent: '#f4d3a0', model: 'fish', hostile: false, health: 5, speed: 1.1, scale: .75, aquatic: true, seaLife: true },
  'sea-turtle': { name: 'Sea Turtle', body: '#5f8f5a', accent: '#c8c28a', model: 'fish', hostile: false, health: 16, speed: .6, scale: 1.2, aquatic: true, seaLife: true },
  'sea-jellyfish': { name: 'Jellyfish', body: '#c99cf2', accent: '#f6e3ff', model: 'slime', hostile: false, health: 3, speed: .4, scale: .9, aquatic: true, seaLife: true },
  'sea-reef-shark': { name: 'Reef Shark', body: '#7f93a3', accent: '#eef3f5', model: 'fish', hostile: false, health: 22, speed: 1.8, scale: 1.8, aquatic: true, seaLife: true },
  'sea-anglerfish': { name: 'Anglerfish', body: '#2b2f3a', accent: '#ffd166', model: 'fish', hostile: false, health: 12, speed: .8, scale: 1.1, aquatic: true, seaLife: true },
};
const variantColors = ['#85ad93', '#b996ae', '#b6b875', '#84aabd', '#d39971', '#ad83c4', '#739a89', '#cbb093'];
for (let i = 0; i < 16; i++) {
  const base = MOBS[i % 3 === 0 ? 'sniffer' : i % 3 === 1 ? 'fox' : 'slime'];
  MOBS[`wild-${i}`] = { ...base, name: `${['Prismatic','Copper','Moonlit','Verdant'][i % 4]} ${['Grazer','Prowler','Sprite','Burrower'][Math.floor(i / 4)]}`, body: variantColors[i % 8], accent: variantColors[(i + 3) % 8], scale: .6 + i % 5 * .15 };
}