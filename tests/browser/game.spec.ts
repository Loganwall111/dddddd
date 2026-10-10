import { expect, test } from '@playwright/test';

test('title, controls, settings, and responsive menus', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?renderer=webgl');
  await expect(page.getByRole('heading', { name: 'Aetherforged: Reincarnated' })).toBeVisible();
  await page.getByRole('button', { name: 'Options...', exact: true }).click();
  await page.getByRole('button', { name: 'Accessibility', exact: true }).click();
  await page.getByRole('switch', { name: 'Reduce interface motion' }).click();
  await expect(page.locator('.app-shell')).toHaveClass(/reduced-motion/);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Controls & Help', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Mine blocks');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Singleplayer', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('cinematic tour is reachable in-game and can be safely ended', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/?renderer=webgl&qa=1');
  await page.getByRole('button', { name: 'Singleplayer', exact: true }).click();
  await page.getByRole('button', { name: 'Create new world', exact: true }).click();
  await page.getByLabel('World name', { exact: true }).fill('Tour Acceptance');
  await page.getByLabel('World seed').fill('TOUR-ACCEPTANCE-2026');
  await page.getByRole('button', { name: 'Create World', exact: true }).click();
  await page.getByRole('button', { name: 'Begin exploring' }).click({ timeout: 60000 });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Cinematic Tour' }).click();
  await expect(page.locator('.tour-overlay h2')).toContainText('Wildflower Plains', { timeout: 60000 });
  await page.getByRole('button', { name: 'End tour' }).click();
  await expect(page.getByRole('heading', { name: 'Game Menu' })).toBeVisible();
});

test('create, simulate movement, mine, place, explode, persist, and change dimension', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?renderer=webgl&qa=1');
  await page.getByRole('button', { name: 'Singleplayer', exact: true }).click();
  await page.getByRole('button', { name: 'Create new world', exact: true }).click();
  await page.getByLabel('World name', { exact: true }).fill('Integration Meadow');
  await page.getByLabel('World seed').fill('QA-ALPINE-2026');
  await page.getByRole('button', { name: 'Create World',exact:true }).click();
  await page.getByRole('button', { name: 'Begin exploring' }).click({ timeout: 60000 });
  await page.keyboard.press('KeyV');
  const before = await page.evaluate(() => (window as any).__AWAKENING__.player.position.z);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => (window as any).__AWAKENING__.player.position.z);
  expect(after).toBeGreaterThan(before);
  await page.evaluate(() => {
    const game = (window as any).__AWAKENING__;
    game.player.teleport([2.5, 48, -3.5]); game.player.yaw = 0; game.player.pitch = 0; game.player.flying = true; game.player.updateCamera();
    game.world.setBlock(2, 49, 0, 3); game.world.setBlock(2, 49, 2, 3);
  });
  await page.mouse.down({ button: 'left' });
  await expect.poll(() => page.evaluate(() => (window as any).__AWAKENING__.world.getBlock(2, 49, 0))).toBe(0);
  await page.mouse.up({ button: 'left' });
  await page.evaluate(() => (window as any).__AWAKENING__.give(8));
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
  await expect.poll(() => page.evaluate(() => (window as any).__AWAKENING__.world.getBlock(2, 49, 1))).toBe(8);
  await page.keyboard.press('KeyE');
  await page.getByRole('textbox', { name: 'Search items' }).fill('TNT');
  await page.getByRole('button', { name: 'TNT', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const g = (window as any).__AWAKENING__;
    g.world.setBlock(4, 48, 0, 27); g.world.setBlock(5, 48, 0, 3);
    g.explosions.prime(4, 48, 0, .15);
  });
  await expect.poll(() => page.evaluate(() => (window as any).__AWAKENING__.world.getBlock(5, 48, 0)), { timeout: 15000 }).toBe(0);
  await page.evaluate(async () => {
    const g = (window as any).__AWAKENING__;
    g.world.setBlock(8, 48, 8, 63); await g.saveNow();
  });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Dimensions', exact: true }).click();
  await page.getByRole('button', { name: /The Nether/ }).click();
  await expect(page.getByRole('button', { name: 'Begin exploring' })).toBeVisible({ timeout: 60000 });
  expect(await page.evaluate(() => (window as any).__AWAKENING__.save.dimension)).toBe('nether');
  await page.getByRole('button', { name: 'Begin exploring' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save & Return to Title' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Singleplayer', exact: true }).click();
  await page.getByRole('button', { name: 'Integration Meadow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Begin exploring' })).toBeVisible({ timeout: 60000 });
  expect(await page.evaluate(() => (window as any).__AWAKENING__.save.edits.overworld['8,48,8'])).toBe(63);
  expect(errors).toEqual([]);
});