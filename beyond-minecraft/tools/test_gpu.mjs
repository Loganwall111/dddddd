/** Offscreen GLSL regression tests: synthetic buffers, NOT screenshots of Minecraft.
 * Adapts only the version/precision preamble; the complete real fragment program is shared.
 * npm install --prefix tools/.runtime @sparticuz/chromium@153.0.0 playwright-core@1.63.0
 */
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'tools/.runtime/package.json'));
const { chromium } = require('playwright-core');
const Chromium = (await import(require.resolve('@sparticuz/chromium'))).default;
const fragment = readFileSync(path.join(root, 'src/main/resources/assets/beyond/shaders/core/cosmos.fsh'), 'utf8')
  .replace('#version 150', '#version 300 es\nprecision highp float;\nprecision highp int;');
const vertex = readFileSync(path.join(root, 'src/main/resources/assets/beyond/shaders/core/fullscreen.vsh'), 'utf8')
  .replace('#version 150', '#version 300 es\nprecision highp float;');
const browser = await chromium.launch({ executablePath: await Chromium.executablePath(), args: Chromium.args, headless: true });
try {
  const page = await browser.newPage({ viewport: {width: 512, height: 512} });
  const result = await page.evaluate(({vertex, fragment}) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    document.body.appendChild(canvas);
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw Error('WebGL 2 unavailable');
    function compile(type, text) {
      const s=gl.createShader(type); gl.shaderSource(s,text); gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s)); return s;
    }
    const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);
    const vertices=new Float32Array([-1,-1,0,0,0,1,-1,0,1,0,-1,1,0,0,1,-1,1,0,0,1,1,-1,0,1,0,1,1,0,1,1]);
    const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
    for(const [name,size,offset] of [['Position',3,0],['UV0',2,12]]){const a=gl.getAttribLocation(p,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,20,offset);}
    const unit=(name,v)=>gl.uniform1f(gl.getUniformLocation(p,name),v);
    const v3=(name,...v)=>gl.uniform3f(gl.getUniformLocation(p,name),...v);
    const v4=(name,...v)=>gl.uniform4f(gl.getUniformLocation(p,name),...v);
    const matrix=(name,v)=>gl.uniformMatrix4fv(gl.getUniformLocation(p,name),false,new Float32Array(v));
    const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
    const f=1/Math.tan(70*Math.PI/360),n=.05,far=256,a=(far+n)/(n-far),b=2*far*n/(n-far);
    matrix('Projection',[f,0,0,0,0,f,0,0,0,0,a,-1,0,0,b,0]);
    matrix('InverseProjection',[1/f,0,0,0,0,1/f,0,0,0,0,0,1/b,0,0,-1,a/b]);
    matrix('CameraToWorld',identity);matrix('WorldToCamera',identity);
    gl.uniform2f(gl.getUniformLocation(p,'Resolution'),64,64);
    v3('CameraPosition',0,2,0);v3('WitnessDirection',0,.48,-1);
    const original=new Uint8Array(64*64*4);
    for(let i=0;i<64*64;i++) original.set([60,90,120,255],i*4);
    function texture(name, index, data, floating=false) {
      const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,t);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,floating?gl.R32F:gl.RGBA8,64,64,0,floating?gl.RED:gl.RGBA,floating?gl.FLOAT:gl.UNSIGNED_BYTE,data);
      gl.uniform1i(gl.getUniformLocation(p,name),index);return t;
    }
    texture('SceneSampler',0,original); const depthTexture=texture('DepthSampler',1,new Float32Array(4096).fill(1),true);
    function depth(z) {
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,depthTexture);
      const d=z===Infinity?1:((-a*z+b)/z)*.5+.5;
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,64,64,gl.RED,gl.FLOAT,new Float32Array(4096).fill(d));
    }
    function reset(){
      for(const [name,value] of Object.entries({Time:3,Motion:0,IntroPhase:-1,EffectStrength:1,RaySteps:48,LensMode:-1,Transition:0,RealmTheme:-1,CosmicPresence:0}))unit(name,value);
      for(let i=0;i<4;i++){v4('Node'+i,0,0,0,0);v4('Style'+i,0,0,0,0);}depth(Infinity);
    }
    function draw(){gl.drawArrays(gl.TRIANGLES,0,6);gl.finish();const out=new Uint8Array(original.length);gl.readPixels(0,0,64,64,gl.RGBA,gl.UNSIGNED_BYTE,out);if(gl.getError()!==gl.NO_ERROR)throw Error('GPU error');return out;}
    function deviation(out){let max=0;for(let i=0;i<out.length;i++)max=Math.max(max,Math.abs(out[i]-original[i]));return max;}
    const tests=[];
    function check(name,assertion){tests.push({name,pass:Boolean(assertion)});}
    reset();check('inactive compositor is identity',deviation(draw())<=1);
    reset();v4('Node0',0,0,-9,1.15);v4('Style0',2,0,491,0);depth(2);
    check('foreground geometry occludes singularity',deviation(draw())<=1);
    reset();v4('Node0',0,0,-4,1.6);v4('Style0',1,0,491,0);depth(2);
    check('foreground geometry occludes membrane',deviation(draw())<=1);
    reset();v4('Node0',0,0,-9,1.15);v4('Style0',2,0,491,0);
    let out=draw(),idx=(32*64+32)*4;check('event horizon captures center ray',out[idx]<15&&out[idx+1]<15&&out[idx+2]<20);
    for(const steps of [32,48,72]){unit('RaySteps',steps);out=draw();check('horizon remains stable at '+steps+' steps',out[idx]<15&&out[idx+1]<15);}
    reset();v4('Node0',0,0,-4,1.6);v4('Style0',1,0,491,0);check('membrane renders a nonempty vista',deviation(draw())>35);
    reset();v4('Node0',0,0,-9,1.15);v4('Style0',2,0,491,0);unit('CosmicPresence',1);unit('IntroPhase',3);unit('LensMode',2);unit('EffectStrength',0);
    check('zero intensity is exact passthrough',deviation(draw())<=1);
    for(let lens=0;lens<6;lens++){reset();unit('CosmicPresence',1);unit('LensMode',lens);out=draw();const colors=new Set();for(let i=0;i<out.length;i+=4)colors.add(out.slice(i,i+3).join(','));check('lens '+lens+' is not a blank frame',colors.size>20);}
    return {backend:gl.getParameter(gl.RENDERER),tests,passed:tests.filter(t=>t.pass).length,total:tests.length};
  }, {vertex, fragment});
  console.log(JSON.stringify(result,null,2));
  mkdirSync(path.join(root,'tools/test-output'),{recursive:true});
  writeFileSync(path.join(root,'tools/test-output/gpu-regression.json'),JSON.stringify(result,null,2)+'\n');
  if(result.passed!==result.total) process.exitCode=1;
} finally {await browser.close();}
