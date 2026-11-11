// 23 C6: per-slot satellites in play. Walks Harbor Pod's beats, logs each station's open count and slot
// mask (`pr=`, `pm=`), and shoots the first beats where a mask has a gap (a PR in the middle closed and no
// tender shifted), plus one mid-act (a merge docking its own slot). Fixture data only (INV-18).
// Stills are copied to review/v1.3/C/C6-*.png by hand. Run with --paradigm solar.
import type { Drive } from '../drive';

export default async function c6(d: Drive): Promise<void> {
  const { page } = d;
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.locator('.chooser button', { hasText: 'Sprint 13' }).click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + 6, box.y + box.height - 6);
  await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); });
  const masks = () => page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes
    .filter((n) => n.kind === 'facility').map((n) => (/pr=(\d+)(?:\|pm=(\d+))?/.exec(n.stage) ?? []).slice(1).join('/') + ` ${n.label}`));
  const beats = await page.evaluate(() => window.__starChartTest!.beatTimes().map((b) => b.startMs));
  let gaps = 0;
  for (let i = 0; i < beats.length && gaps < 3; i++) {
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x + 1), beats[i]!);
    await page.waitForTimeout(250);
    const m = await masks();
    d.note(`beat ${i}: ${m.join(' · ')}`);
    const gap = m.some((s) => { const pm = Number(s.split('/')[1]?.split(' ')[0]); return pm > 0 && (pm & (pm + 1)) !== 0; });
    if (gap) { await d.shot(`gap-${i}`); gaps++; }
  }
  d.note(`gap stills: ${gaps}`);
  // Per-slot acts, close up (23 C6 review): read tide-gateway's mask at every beat, then for the beats where a slot
  // closes (a merge docks that tender) and where one fills (a launch), seek just before, zoom onto the station, step
  // the beat, and shoot through the act. Reduced motion off; the camera is set again before each shot.
  const GATEWAY = 'tide-gateway';
  const maskAt = () => page.evaluate((name) => {
    const n = window.__starChartTest!.liveNodes().find((x) => x.kind === 'facility' && x.label === name);
    const m = n && /pr=(\d+)\|pm=(\d+)/.exec(n.stage);
    return n && m ? { pr: Number(m[1]), pm: Number(m[2]), x: n.world.x, y: n.world.y, r: n.world.r } : null;
  }, GATEWAY);
  const fit = await page.evaluate(() => window.__starChartTest!.camera());
  const states: ({ pr: number; pm: number; x: number; y: number; r: number } | null)[] = [];
  for (const ms of beats) {
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x + 1), ms);
    await page.waitForTimeout(200);
    states.push(await maskAt());
  }
  const closes: number[] = [];
  const opens: number[] = [];
  states.forEach((st, i) => {
    const prev = states[i - 1];
    if (!st || !prev) return;
    if (prev.pm & ~st.pm) closes.push(i);
    if (st.pm & ~prev.pm) opens.push(i);
  });
  d.note(`gateway beats: closes ${JSON.stringify(closes)}, opens ${JSON.stringify(opens)}`);
  const pkOf = () => page.evaluate((name) => window.__starChartTest!.liveNodes().find((x) => x.kind === 'facility' && x.label === name)?.projectionKey ?? null, GATEWAY);
  /** The drawn tenders and the bay, read back from the art (the `tenders` test hook), by slot. */
  const readTenders = async () => {
    const pk = await pkOf();
    return pk ? page.evaluate((k) => window.__starChartTest!.tenders(k), pk) : null;
  };
  const act = async (i: number, kind: string) => {
    const before = states[i - 1]!;
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x - 1), beats[i]!);
    await d.settle();
    await page.waitForTimeout(300);
    const look = (await maskAt()) ?? before;
    const cam = { x: look.x, y: look.y, scale: fit.scale * 5 };
    await page.evaluate((c) => window.__starChartTest!.setCamera(c), cam);
    await page.waitForTimeout(500);
    const at = (await page.evaluate((k) => window.__starChartTest!.screenOf(k), (await page.evaluate((name) => window.__starChartTest!.liveNodes().find((x) => x.kind === 'facility' && x.label === name)?.canonicalKey ?? '', GATEWAY))))!;
    const clip = { x: Math.max(0, box.x + at.x - 330), y: Math.max(0, box.y + at.y - 280), width: 660, height: 560 };
    const shoot = (name: string) => page.screenshot({ path: `review/v1.3/C/C6-${kind}-frames-${i}-${name}.png`, clip });
    const slotsBefore = ((await readTenders())?.tenders ?? []).map((t) => t.slot);
    await shoot('before');
    // Slow motion: the scene clock at a fifth, so ~150 ms of wall time is ~30 ms of the act.
    await page.evaluate(() => window.__starChartTest!.setRate(0.2));
    await page.evaluate(() => window.__starChartTest!.stepBeat());
    const rows: { k: number; slots: number[]; docking: number | null; dock: number | null }[] = [];
    let shots = 0;
    for (let k = 0; k < 44; k++) {
      await page.waitForTimeout(200);
      await page.evaluate((c) => window.__starChartTest!.setCamera(c), cam);
      const r = await readTenders();
      if (!r) continue;
      const dk = r.tenders.find((t) => t.docking);
      const dist = dk ? Math.hypot(dk.x - r.bay.x, dk.y - r.bay.y) : null;
      rows.push({ k, slots: r.tenders.map((t) => t.slot), docking: dk?.slot ?? null, dock: dist === null ? null : Math.round(dist) });
      // A key frame: every fourth while a tender is docking, or the first few of a launch.
      if (shots < 8 && ((kind === 'dock' && dk && k % 3 === 0) || (kind === 'launch' && k % 4 === 0))) await shoot(String(shots++));
    }
    await page.evaluate(() => window.__starChartTest!.setRate(1));
    d.note(`${kind} beat ${i}: ${JSON.stringify(before)} -> ${JSON.stringify(states[i])}; slots before ${JSON.stringify(slotsBefore)}`);
    d.note(`${kind} frames: ${rows.map((r) => `${r.k}:[${r.slots}]${r.docking !== null ? ` dock s${r.docking} ${r.dock}px` : ''}`).join(' | ')}`);
    const docked = rows.filter((r) => r.dock !== null);
    if (kind === 'dock' && docked.length) {
      const [first, last] = [docked[0]!, docked.at(-1)!];
      const others = (r: (typeof rows)[number]) => r.slots.filter((x) => x !== r.docking);
      d.note(`dock check: slot ${first.docking}; distance to bay ${first.dock} -> ${last.dock}px; others keep ${JSON.stringify(others(first))} -> ${JSON.stringify(others(last))}`);
    }
  };
  for (const i of closes.slice(0, 1)) await act(i, 'dock');
  for (const i of opens.slice(0, 1)) await act(i, 'launch');
}
