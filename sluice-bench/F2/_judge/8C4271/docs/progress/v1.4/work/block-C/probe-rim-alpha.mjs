/* global process, console */
const SUCCESS = parseInt(process.argv[2], 16);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
for (const A of [0.8, 1]) {
  const rimL = (color, k) => { const [r,g,b] = [(color>>16)&255,(color>>8)&255,color&255].map(v=>Math.min(1,(v/255)*k)*A); return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b); };
  const ratio = (l) => (l+0.05)/(0.007+0.05);
  const t = ratio(rimL(0xcc293d,1.25)), o = ratio(rimL(0x009ccc,1.04)), g = ratio(rimL(SUCCESS,0.68));
  console.log(A, t.toFixed(2), o.toFixed(2), g.toFixed(2), 'g-t', (Math.abs(g-t)/t).toFixed(3), 'g-o', (Math.abs(g-o)/o).toFixed(3), 'r-b', (Math.abs(t-o)/Math.max(t,o)).toFixed(3));
}
