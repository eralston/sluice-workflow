import { Geometry, GlProgram, Shader, UniformGroup, type UniformData } from 'pixi.js';
import { MESH_VERTEX } from './glsl';

/** Live GPU resources we created, for leak checks (03 §10 counts()). */
const live = { geometries: new Set<Geometry>(), shaders: new Set<Shader>() };
export function liveResourceCount(): number {
  return live.geometries.size + live.shaders.size;
}

/** Centered quad of half-size `half` world units, with UVs spanning ±uvHalf. */
export function quadGeometry(half: number, uvHalf: number): Geometry {
  const g = new Geometry({
    attributes: {
      aPosition: [-half, -half, half, -half, half, half, -half, half],
      aUV: [-uvHalf, -uvHalf, uvHalf, -uvHalf, uvHalf, uvHalf, -uvHalf, uvHalf],
    },
    indexBuffer: [0, 1, 2, 0, 2, 3],
  });
  live.geometries.add(g);
  g.once('destroy', () => live.geometries.delete(g));
  return g;
}

const programs = new Map<string, GlProgram>();

/** One GlProgram per fragment source, shared by every instance (each gets its own uniforms). */
export function makeShader(
  name: string, fragment: string, uniforms: Record<string, UniformData>,
): { shader: Shader; u: Record<string, unknown> } {
  let glProgram = programs.get(name);
  if (!glProgram) {
    glProgram = GlProgram.from({ vertex: MESH_VERTEX, fragment, name });
    programs.set(name, glProgram);
  }
  const group = new UniformGroup(uniforms);
  const shader = new Shader({ glProgram, resources: { u: group } });
  live.shaders.add(shader);
  shader.once('destroy', () => live.shaders.delete(shader));
  return { shader, u: group.uniforms as Record<string, unknown> };
}
