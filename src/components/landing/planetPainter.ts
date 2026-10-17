import type { Body } from './planets';

/**
 * Draws one planet on a 2D canvas: atmosphere, a surface that turns (features slide across the
 * disc and foreshorten towards the edge, as on a rotating sphere), light from the central hub
 * and a soft shadow on the far side. No libraries, no images: everything is drawn in code.
 */

interface Feature {
  lon: number; // radians
  lat: number; // -1 … 1 (fraction of the radius)
  size: number; // fraction of the radius
  shade: 'light' | 'dark';
}

/** Small deterministic random generator so every visit draws the same planets. */
function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const featureCache = new Map<string, Feature[]>();

function featuresFor(body: Body): Feature[] {
  const cached = featureCache.get(body.id);
  if (cached) return cached;
  const rnd = seeded(body.id);
  const count = { bands: 4, spots: 9, land: 7, ring: 5, grid: 0, plain: 3 }[body.surface];
  const list: Feature[] = [];
  for (let i = 0; i < count; i += 1) {
    list.push({
      lon: rnd() * Math.PI * 2,
      lat: (rnd() * 2 - 1) * 0.7,
      size: body.surface === 'land' ? 0.35 + rnd() * 0.3 : 0.12 + rnd() * 0.18,
      shade: rnd() > (body.surface === 'land' ? 0.15 : 0.5) ? 'dark' : 'light',
    });
  }
  featureCache.set(body.id, list);
  return list;
}

export interface PaintArgs {
  ctx: CanvasRenderingContext2D;
  body: Body;
  /** Centre in canvas pixels. */
  x: number;
  y: number;
  /** Radius in canvas pixels (already scaled for depth). */
  r: number;
  /** Surface turn, radians. */
  spin: number;
  /** Direction of the light (unit vector from the planet towards the hub). */
  light: { x: number; y: number };
  /** 0 … 1: dimmer when on the far side of its orbit. */
  dim: number;
  /** Axis tilt, radians. */
  tilt: number;
}

function ringPath(ctx: CanvasRenderingContext2D, r: number, half: 'back' | 'front') {
  ctx.beginPath();
  // The ring is an ellipse around the planet; the back half sits behind the disc.
  if (half === 'back') ctx.ellipse(0, 0, r * 1.85, r * 0.5, 0, Math.PI, Math.PI * 2);
  else ctx.ellipse(0, 0, r * 1.85, r * 0.5, 0, 0, Math.PI);
}

function strokeRing(ctx: CanvasRenderingContext2D, body: Body, r: number, half: 'back' | 'front') {
  ctx.save();
  ctx.lineCap = 'round';
  ringPath(ctx, r, half);
  ctx.strokeStyle = body.colors.light;
  ctx.globalAlpha *= half === 'back' ? 0.45 : 0.85;
  ctx.lineWidth = Math.max(1, r * 0.22);
  ctx.stroke();
  ringPath(ctx, r, half);
  ctx.strokeStyle = body.colors.base;
  ctx.lineWidth = Math.max(0.5, r * 0.08);
  ctx.stroke();
  ctx.restore();
}

export function paintPlanet({ ctx, body, x, y, r, spin, light, dim, tilt }: PaintArgs) {
  const { colors } = body;
  if (!(r >= 1)) return; // canvas not laid out yet (zero size)
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.55 + 0.45 * dim;

  // Atmosphere: a soft halo, brighter on the side facing the light.
  const halo = ctx.createRadialGradient(light.x * r * 0.3, light.y * r * 0.3, r * 0.8, 0, 0, r * 1.9);
  halo.addColorStop(0, colors.glow);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(tilt);
  if (body.surface === 'ring') strokeRing(ctx, body, r, 'back');

  // Disc and turning surface (clipped to the sphere).
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  const base = ctx.createLinearGradient(0, -r, 0, r);
  base.addColorStop(0, colors.light);
  base.addColorStop(0.45, colors.base);
  base.addColorStop(1, colors.dark);
  ctx.fillStyle = base;
  ctx.fillRect(-r, -r, r * 2, r * 2);

  if (body.surface === 'bands') {
    ctx.globalAlpha *= 0.35;
    for (let i = -3; i <= 3; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? colors.dark : colors.light;
      ctx.fillRect(-r, (i / 3.5) * r - r * 0.07, r * 2, r * 0.14);
    }
    ctx.globalAlpha /= 0.35;
  }

  if (body.surface === 'grid') {
    ctx.strokeStyle = colors.light;
    ctx.lineWidth = Math.max(0.6, r * 0.06);
    ctx.globalAlpha *= 0.55;
    for (let i = -2; i <= 2; i += 1) {
      const lat = (i / 3) * r;
      const w = Math.sqrt(Math.max(0, r * r - lat * lat));
      ctx.beginPath();
      ctx.moveTo(-w, lat);
      ctx.lineTo(w, lat);
      ctx.stroke();
    }
    // Meridians turn with the planet.
    for (let k = 0; k < 6; k += 1) {
      const lon = spin + (k / 6) * Math.PI * 2;
      if (Math.cos(lon) <= 0) continue;
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        Math.abs(Math.sin(lon)) * r,
        r,
        0,
        Math.sin(lon) >= 0 ? -Math.PI / 2 : Math.PI / 2,
        Math.sin(lon) >= 0 ? Math.PI / 2 : (Math.PI * 3) / 2,
      );
      ctx.stroke();
    }
    ctx.globalAlpha /= 0.55;
  }

  for (const f of featuresFor(body)) {
    const lon = f.lon + spin;
    const facing = Math.cos(lon);
    if (facing <= 0.02) continue; // on the hidden side of the planet
    const py = f.lat * r;
    const ringR = Math.sqrt(Math.max(0, 1 - f.lat * f.lat)) * r;
    const px = Math.sin(lon) * ringR;
    const s = f.size * r;
    ctx.fillStyle = f.shade === 'dark' ? colors.dark : colors.light;
    ctx.globalAlpha *= 0.4 + 0.4 * facing;
    ctx.beginPath();
    ctx.ellipse(px, py, Math.max(0.3, s * facing), s * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha /= 0.4 + 0.4 * facing;
  }
  ctx.restore();

  ctx.rotate(-tilt);

  // Light from the hub: highlight towards it, shadow on the far side.
  const lx = light.x * r * 0.55;
  const ly = light.y * r * 0.55;
  const shine = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 1.1);
  shine.addColorStop(0, 'rgba(255,255,255,0.55)');
  shine.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  const shade = ctx.createLinearGradient(light.x * r, light.y * r, -light.x * r, -light.y * r);
  shade.addColorStop(0, 'rgba(4,8,24,0)');
  shade.addColorStop(0.55, 'rgba(4,8,24,0.12)');
  shade.addColorStop(1, 'rgba(4,8,24,0.68)');
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = shine;
  ctx.fill();
  ctx.fillStyle = shade;
  ctx.fill();

  // Thin bright rim on the lit edge (atmosphere scattering).
  ctx.beginPath();
  ctx.arc(0, 0, r - 0.5, Math.atan2(light.y, light.x) - 1.1, Math.atan2(light.y, light.x) + 1.1);
  ctx.strokeStyle = colors.glow;
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.stroke();

  if (body.surface === 'ring') {
    ctx.rotate(tilt);
    strokeRing(ctx, body, r, 'front');
  }
  ctx.restore();
}
