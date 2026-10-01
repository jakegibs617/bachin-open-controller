// Open a plan in Bachin Open Controller on this computer, take a screenshot, and leave the window open.
// Preview only: it never touches the Machine tab (plotting is left to the user).
//
// Usage: node open_in_controller.cjs PLAN.boc.json [SCREENSHOT.png]
// Env:   BOC_APP     controller checkout with a current build (default: the repo this skill lives in)
//        PLAYWRIGHT  path to the playwright package (default: the playwright-skill plugin's copy)
const path = require('path');
const os = require('os');

// __dirname resolves symlinks, so a symlinked copy of this skill still finds its own repo.
const APP = process.env.BOC_APP || path.resolve(__dirname, '../../../..');
const PW = process.env.PLAYWRIGHT
  || path.join(os.homedir(), '.claude/plugins/marketplaces/playwright-skill/skills/playwright-skill/node_modules/playwright');
const [plan, shot = path.join(os.tmpdir(), 'boc-preview.png')] = process.argv.slice(2);
if (!plan) { console.error('usage: node open_in_controller.cjs PLAN.boc.json [SCREENSHOT.png]'); process.exit(2); }

const { _electron } = require(PW);
(async () => {
  const app = await _electron.launch({
    executablePath: require(path.join(APP, 'node_modules/electron')),
    args: [path.join(APP, 'dist/electron/main.js')],
    cwd: APP
  });
  app.on('close', () => process.exit(0));
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(1500);
  await win.getByText('Artwork', { exact: true }).first().click();
  await win.locator('#open-file').setInputFiles(path.resolve(plan));
  await win.waitForTimeout(4000);

  const rows = await win.locator('.artwork-layer-row').allInnerTexts();
  for (const row of rows) {
    const name = row.split('\n').find((t) => t.trim() && !/^\d+$/.test(t.trim()));
    if (!name) continue;
    await win.getByRole('button', { name: name.trim() }).first().click();
    await win.waitForTimeout(600);
    const v = await win.evaluate(() => Object.fromEntries(
      ['img-offset-x', 'img-offset-y', 'img-width', 'img-height', 'img-scale-number']
        .map((id) => [id.replace('img-', ''), document.getElementById(id)?.value])
    ));
    console.log(JSON.stringify({ layer: name.trim(), ...v }));
  }
  const linked = await win.getByRole('button', { name: /Layers (linked|unlinked)/ }).count();
  if (!linked) console.log('NOTE this controller build has no "Layers linked" toggle; rebuild from master (PR #13 or later).');
  await win.locator('#img-width').scrollIntoViewIfNeeded();
  await win.screenshot({ path: shot });
  console.log(`SCREENSHOT ${shot}`);
  console.log('READY (window stays open until you close it)');
  await new Promise(() => {});
})().catch((e) => { console.error(e); process.exit(1); });
