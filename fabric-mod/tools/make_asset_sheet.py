"""Optional flat contact sheet of REAL source textures. Requires ImageMagick, not Minecraft."""
from pathlib import Path
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[1]
tex=ROOT/'src/main/resources/assets/entersift/textures/block'
output=ROOT/'docs/visual-assets.png'
with tempfile.TemporaryDirectory() as tmp:
    canvas=Path(tmp)/'canvas.png'
    subprocess.run(['convert','-size','1200x810','xc:#0a1420',str(canvas)],check=True)
    def draw(*args): subprocess.run(['convert',str(canvas),*args,str(canvas)],check=True)
    def text(x,y,s,size=16,color='#a5b9c6',font='DejaVu-Sans'):
        draw('-font',font,'-pointsize',str(size),'-fill',color,'-annotate',f'+{x}+{y}',s)
    def tile(name,x,y,w,h):
        path=tex/f'{name}.png'
        # Only the first animation frame, with nearest-neighbour scaling. No synthesized screenshot.
        crop='32x32+0+0' if name in ['threshold','rift_membrane','ichor_still'] else '16x16+0+0'
        image=Path(tmp)/f'{name}.png'
        subprocess.run(['convert',str(path),'-crop',crop,'+repage','-filter','point','-resize',f'{w}x{h}!',str(image)],check=True)
        draw(str(image),'-geometry',f'+{x}+{y}','-composite')
    text(42,43,'ENTER THE SIFT / 0.2',18,'#72e6df','DejaVu-Sans-Mono')
    text(42,90,'Reference-driven texture pass',33,'#f1f6fa','DejaVu-Sans-Bold')
    text(42,120,'ACTUAL SOURCE ASSETS  /  FLAT CONTACT SHEET  /  NOT A MINECRAFT SCREENSHOT',13,'#e5b786','DejaVu-Sans-Mono')
    for name,x,title,caption in [
        ('threshold',42,'01  ANCIENT CITY THRESHOLD','Cyan mosaic / bright edge'),
        ('rift_membrane',428,'02  WANDERING RIFT','Coral-gold animated membrane'),
        ('ichor_still',814,'03  ICHOR','Pastel rainbow / opalescent glints')]:
        tile(name,x,152,344,242)
        text(x,424,title,15,'#f1f6fa','DejaVu-Sans-Mono')
        text(x,451,caption,15)
    text(42,506,'SIX RESONANCE MATERIALS',17,'#f1f6fa','DejaVu-Sans-Mono')
    for i,name in enumerate(['red','magenta','pink','cyan','blue','purple']):
        x=42+i*122; tile('resonance_'+name,x,526,96,60)
        text(x,610,name.upper(),12)
    text(42,650,'Full-bright note rims + particles. Not coloured light cast onto terrain.',14)
    for i,(name,label) in enumerate([('saltstone','ROSE SALTSTONE'),('singer_moss','TEAL MEADOW')]):
        x=840+i*164;tile(name,x,502,140,110);text(x,637,label,12,'#a5b9c6','DejaVu-Sans-Mono')
    draw('-stroke','#263746','-draw','line 42,687 1158,687')
    text(42,725,'Also authored: Sift-only ribbon sky, day/night variation, stepped rift geometry and drifting shards.',15)
    text(42,756,'All Minecraft rendering, shader compilation and visual fidelity remain unverified. Source alpha only.',14,'#e5b786')
    subprocess.run(['convert',str(canvas),str(output)],check=True)
print(output)
