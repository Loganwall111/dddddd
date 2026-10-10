import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BLOCKS } from '../src/blocks/registry';
import { itemIcon } from '../src/blocks/textures';
import { MOBS } from '../src/entities/registry';
import { hash3,seedNumber } from '../src/world/noise';

const directory=resolve(process.argv[2]||'public/generated-art');
await mkdir(`${directory}/items`,{recursive:true});await mkdir(`${directory}/mobs`,{recursive:true});
for(const block of BLOCKS.slice(1)){
  const data=itemIcon(block.id),svg=decodeURIComponent(data.slice(data.indexOf(',')+1));
  await writeFile(`${directory}/items/${block.id}-${block.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.svg`,svg);
}
for(const [id,mob]of Object.entries(MOBS)){
  const seed=seedNumber(id);let pixels='';
  for(let x=0;x<16;x++)for(let y=0;y<16;y++){
    const inside=x>2&&x<13&&y>2&&y<14;if(!inside)continue;
    const eye=y>=6&&y<=7&&(x===5||x===10),patch=hash3(Math.floor(x/2),Math.floor(y/2),0,seed)>.74;
    pixels+=`<rect x="${x*4}" y="${y*4}" width="4" height="4" fill="${eye?'#202820':patch?mob.accent:mob.body}"/>`;
  }
  await writeFile(`${directory}/mobs/${id}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" shape-rendering="crispEdges">${pixels}</svg>`);
}
await writeFile(`${directory}/manifest.json`,JSON.stringify({generator:'Aetherforged: Reincarnated 0.2',items:BLOCKS.slice(1).map(({id,name,category,procedural})=>({id,name,category,procedural:!!procedural})),mobs:Object.entries(MOBS).map(([id,{name,model}])=>({id,name,model}))},null,2));
console.log(`Wrote ${BLOCKS.length-1} item icons and ${Object.keys(MOBS).length} creature portraits to ${directory}. All assets are deterministically generated and original.`);
