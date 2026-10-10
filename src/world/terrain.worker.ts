import { generateChunk, type GenConfig } from './generator';
import { meshChunk } from './mesher';
import { block } from '../blocks/registry';

export interface ChunkRequest { cx: number; cz: number; revision: number; epoch: number; config: GenConfig; edits: Record<string, number> }
globalThis.onmessage = (event: MessageEvent<ChunkRequest>) => {
  const { cx, cz, revision, epoch, config, edits } = event.data;
  try {
    const { padded, data } = generateChunk(cx, cz, config, edits);
    const mesh = meshChunk(padded,'opaque');
    const glass=data.includes(9)?meshChunk(padded,'glass'):null;
    const specials: {x:number;y:number;z:number;id:number}[]=[];
    for(let i=0;i<data.length;i++){const id=data[i];if(block(id).portal||block(id).mirror||block(id).note!==undefined)specials.push({x:cx*16+Math.floor(i/2048),y:i%128,z:cz*16+Math.floor(i/128)%16,id});}
    const transfer = [data.buffer, mesh.positions.buffer, mesh.normals.buffer, mesh.uvs.buffer, mesh.colors.buffer, mesh.indices.buffer] as ArrayBuffer[];
    if(glass)transfer.push(glass.positions.buffer as ArrayBuffer,glass.normals.buffer as ArrayBuffer,glass.uvs.buffer as ArrayBuffer,glass.colors.buffer as ArrayBuffer,glass.indices.buffer as ArrayBuffer);
    globalThis.postMessage({ cx, cz, revision, epoch, data, specials, glass, ...mesh }, { transfer });
  } catch (error) {
    globalThis.postMessage({ cx, cz, revision, epoch, error: error instanceof Error ? error.message : String(error) });
  }
};