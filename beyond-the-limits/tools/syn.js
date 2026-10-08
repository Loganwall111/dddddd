const fs=require('fs');
const parser=require('java-parser');
const dir=process.argv[2]||'../src/main/java';
let bad=0,n=0;
const stack=[dir];
while(stack.length){
  const d=stack.pop();
  for(const f of fs.readdirSync(d)){
    const p=d+'/'+f;const st=fs.statSync(p);
    if(st.isDirectory())stack.push(p);
    else if(f.endsWith('.java')){
      n++;
      try{parser.parse(fs.readFileSync(p,'utf8'));}
      catch(e){bad++;console.log('FAIL',p,(''+e.message).split('\n')[0].slice(0,200));}
    }
  }
}
console.log('files',n,'failed',bad);
