// Shared GLSL. Pixi v8 inserts precision, and shaders use in/out and `finalColor`, but a source
// without its own `#version 300 es` line compiles as GLSL ES 1.00 (found 2026-10-10): no array
// constructors, integer `%`, `fwidth` or `dFdx`. A shader that needs them declares the version itself.

export const MESH_VERTEX = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`;

/** Value noise + fBm. Seeds add variation only; state comes from explicit uniforms (06 §7). */
export const NOISE = /* glsl */ `
float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x),
        mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x),
        mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}
float fbm3(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}
const vec3 INK = vec3(0.031, 0.086, 0.161);
const vec3 COBALT = vec3(0.208, 0.365, 0.631);
const vec3 VIOLET = vec3(0.475, 0.337, 0.561);
const vec3 IVORY = vec3(0.957, 0.941, 0.871);
const vec3 AMBER = vec3(0.945, 0.718, 0.357);
const vec3 CYAN = vec3(0.514, 0.867, 0.886);
const vec3 CORAL = vec3(0.914, 0.537, 0.451);
`;
