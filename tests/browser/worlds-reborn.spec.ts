import {expect,test} from '@playwright/test';

test('classic title and character creator retain custom appearance',async({page})=>{
  await page.goto('/?renderer=webgl');
  await expect(page.getByRole('heading',{name:'Aetherforged: Reincarnated'})).toBeVisible();
  await page.getByRole('button',{name:'Character...',exact:true}).click();
  await page.getByLabel('Name',{exact:true}).fill('Nia');
  await page.getByLabel('Custom shirt color').fill('#8844aa');
  await page.getByRole('button',{name:'Hairstyle: short'}).click();
  await page.getByRole('button',{name:'Save character'}).click();
  await page.reload();
  await page.getByRole('button',{name:'Character...',exact:true}).click();
  await expect(page.getByLabel('Name',{exact:true})).toHaveValue('Nia');
  await expect(page.getByLabel('Custom shirt color')).toHaveValue('#8844aa');
  await expect(page.getByRole('button',{name:'Hairstyle: long'})).toBeVisible();
});

test('expanded inventory and ancient-city resonance gate are functional',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?renderer=webgl&qa=1');
  await page.getByRole('button',{name:'Singleplayer',exact:true}).click();
  await page.getByRole('button',{name:'Create new world',exact:true}).click();
  await page.getByLabel('World name',{exact:true}).fill('Resonance Test');
  await page.getByLabel('World seed').fill('reborn-qa');
  await page.getByRole('button',{name:'Create World',exact:true}).click();
  await page.getByRole('button',{name:'Begin exploring'}).click({timeout:60000});
  await page.keyboard.press('KeyE');
  await page.getByRole('button',{name:'Spawn Eggs',exact:true}).click();
  await expect(page.getByRole('button',{name:'Moss Sniffer Spawn Egg',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Search items'}).fill('wither');
  await page.getByRole('button',{name:'Ash Wither Spawn Egg',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{
    const g=(window as any).__AWAKENING__;g.pause();g.player.teleport([42.5,18,-30.5]);
    await g.world.waitForSpawn(42.5,-30.5,()=>{});
  });
  const result=await page.evaluate(()=>{
    const g=(window as any).__AWAKENING__;
    for(const note of [0,2,1,3,0])g.portals.note({x:39+note*2,y:17,z:-29,id:79+note,normal:[0,1,0],distance:2});
    return {gate:g.world.getBlock(42,19,-24),unlocked:g.save.portalKeys.includes('ancient-city')};
  });
  expect(result.gate).toBe(83);expect(result.unlocked).toBe(true);
  await page.evaluate(async()=>{const g=(window as any).__AWAKENING__;await g.travel('sift');});
  await expect(page.getByRole('button',{name:'Begin exploring'})).toBeVisible({timeout:60000});
  expect(await page.evaluate(()=>(window as any).__AWAKENING__.save.dimension)).toBe('sift');
  expect(errors).toEqual([]);
});