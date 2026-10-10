import { useEffect,useRef,useState } from 'react';
import { Check,RotateCcw,Shuffle } from 'lucide-react';
import { DEFAULT_CHARACTER,type CharacterStyle } from '../core/types';
import { Modal } from './Common';
import type { CharacterPreview } from '../rendering/CharacterPreview';

export function CharacterCanvas({style}:{style:CharacterStyle}){
  const canvas=useRef<HTMLCanvasElement>(null),view=useRef<CharacterPreview|null>(null),latest=useRef(style);latest.current=style;
  const [failed,setFailed]=useState(false);
  useEffect(()=>{let canceled=false;void import('../rendering/CharacterPreview').then(({CharacterPreview:Renderer})=>{if(!canceled&&canvas.current)view.current=new Renderer(canvas.current,latest.current);}).catch(()=>setFailed(true));return()=>{canceled=true;view.current?.dispose();view.current=null;};},[]);
  useEffect(()=>view.current?.setStyle(style),[style]);
  return <div className="character-canvas-wrap"><canvas ref={canvas} aria-label="3D character preview. Drag to rotate."/>{failed&&<span>3D preview requires WebGL</span>}</div>;
}
const swatches:Record<string,string[]>={skin:['#efd2ad','#dfb690','#bd936f','#a27653','#81583f','#624332'],eyes:['#527a82','#497547','#8e693d','#3c3837','#737faa','#9c749e'],hair:['#342a21','#503925','#795034','#a77944','#d6bd77','#d6d1ba','#a35a45','#657075','#506b96','#b26c92'],shirt:['#4c9294','#4e719e','#6f8d54','#b2994f','#b6635d','#87659b','#d0d1be','#555b5a'],trousers:['#454f80','#4e5e62','#665749','#747a75','#6c4451','#426947'],boots:['#504536','#343937','#947554','#acb6ad','#765749']};
export function CharacterCreator({character,onSave,onClose}:{character:CharacterStyle;onSave:(value:CharacterStyle)=>void|Promise<void>;onClose:()=>void}){
  const [draft,setDraft]=useState({...character});
  const [saving,setSaving]=useState(false);
  const randomize=()=>{const next={...draft};for(const key of Object.keys(swatches) as (keyof typeof swatches)[])next[key as keyof Omit<CharacterStyle,'name'|'hairStyle'>]=swatches[key][Math.floor(Math.random()*swatches[key].length)];setDraft(next);};
  return <Modal title="Character" eyebrow="MAKE THIS ADVENTURE YOURS" onClose={onClose} wide className="character-modal">
    <div className="character-creator-layout"><div className="character-view"><CharacterCanvas style={draft}/><span>Drag to turn</span><label className="field">Name<input value={draft.name} maxLength={24} onChange={e=>setDraft({...draft,name:e.target.value})}/></label></div>
    <div className="character-customization">{Object.entries(swatches).map(([key,colors])=><div key={key} className="palette-row"><span>{key==='trousers'?'Pants':key[0].toUpperCase()+key.slice(1)}</span><div className="color-swatches">{colors.map(color=><button key={color} className={draft[key as keyof CharacterStyle]===color?'chosen':''} style={{backgroundColor:color}} onClick={()=>setDraft({...draft,[key]:color})} title={`${key} ${color}`} aria-label={`${key} ${color}`}/>)}<label className="custom-color" title={`Custom ${key} color`}><input type="color" aria-label={`Custom ${key} color`} value={draft[key as keyof CharacterStyle]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label></div></div>)}
    <button className="button secondary hair-style" onClick={()=>{const list=['short','long','mohawk'] as const;setDraft({...draft,hairStyle:list[(list.indexOf(draft.hairStyle)+1)%3]});}}>Hairstyle: {draft.hairStyle}</button>
    <div className="character-actions"><button className="button secondary" onClick={randomize}><Shuffle size={15}/>Randomize</button><button className="button secondary" onClick={()=>setDraft({...DEFAULT_CHARACTER})}><RotateCcw size={15}/>Reset</button></div></div></div>
    <footer className="modal-footer"><span className="fine-print">Your skin is used in first and third person.</span><button className="button primary" disabled={saving} onClick={async()=>{setSaving(true);try{await onSave(draft);onClose();}finally{setSaving(false);}}}>{saving?'Saving...':'Save character'}<Check size={15}/></button></footer>
  </Modal>;
}