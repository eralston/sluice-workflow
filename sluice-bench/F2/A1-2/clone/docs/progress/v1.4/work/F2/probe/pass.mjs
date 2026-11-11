// copy of passTangent/passPoint from movers.ts (pure math), to probe geometry ratios
const unit = (v) => { const l = Math.hypot(v[0], v[1]); return l < 1e-9 ? [0, 0] : [v[0] / l, v[1] / l]; };
function passTangent(a, spot, home) { const d1 = unit([spot[0]-a[0], spot[1]-a[1]]); const d2 = unit([home[0]-spot[0], home[1]-spot[1]]); const s=[d1[0]+d2[0], d1[1]+d2[1]]; if (Math.hypot(...s) < 1e-3) return [-d1[1], d1[0]]; return unit(s); }
const hermite = (p0, m0, p1, m1, u) => { const u2=u*u,u3=u2*u; const h00=2*u3-3*u2+1,h10=u3-2*u2+u,h01=-2*u3+3*u2,h11=u3-u2; return [h00*p0[0]+h10*m0[0]+h01*p1[0]+h11*m1[0], h00*p0[1]+h10*m0[1]+h01*p1[1]+h11*m1[1]]; };
function passPoint(a, spot, home, tan, outS, backS, t, vs) { const v = vs ?? (Math.hypot(spot[0]-a[0], spot[1]-a[1])/outS + Math.hypot(home[0]-spot[0], home[1]-spot[1])/backS)/2; const z=[0,0]; if (t<=outS) return hermite(a,z,spot,[outS*v*tan[0],outS*v*tan[1]],Math.max(0,t/outS)); return hermite(spot,[backS*v*tan[0],backS*v*tan[1]],home,z,Math.min(1,(t-outS)/backS)); }
const outS = 0.715, backS = 1.8;
function check(a, spot, home) {
  const tan = passTangent(a, spot, home); let minV = Infinity, at = 0, rev = false; let prev = null;
  for (let t = 0.02; t <= outS + backS - 0.02; t += 0.002) {
    const p = passPoint(a, spot, home, tan, outS, backS, t - 0.001), q = passPoint(a, spot, home, tan, outS, backS, t + 0.001);
    const vel = [(q[0]-p[0])/0.002, (q[1]-p[1])/0.002]; const sp = Math.hypot(...vel);
    if (prev && vel[0]*prev[0]+vel[1]*prev[1] < 0) rev = true;
    prev = vel; if (sp < minV) { minV = sp; at = t; }
  }
  return { minV: +minV.toFixed(2), at: +at.toFixed(3), reverses: rev };
}
// start == home (usual case), facility at distance D from the ship; spot 1.9R off the facility toward the ship.
for (const [label, a, spot, home] of [
  ['start=home, spot far', [0,0], [300,0], [0,0]],
  ['start=home, spot near', [0,0], [20,0], [0,0]],
  ['home on far side of spot, e=0.2d', [0,0], [300,0], [360,0]],
  ['home just past spot, e=0.05d', [0,0], [300,0], [315,0]],
  ['home beside spot, 90deg, e=0.2d', [0,0], [300,0], [300,60]],
  ['home far beyond, e=5d', [0,0], [100,0], [600,100]],
  ['home far beyond, e=10d', [0,0], [100,0], [1100,100]],
  ['start near spot, home far back', [280,0], [300,0], [0,0]],
]) console.log(label.padEnd(36), JSON.stringify(check(a, spot, home)));
