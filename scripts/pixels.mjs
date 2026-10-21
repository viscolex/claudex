// Shrinking RGBA pixels by area averaging, with nothing but plain JavaScript.

/**
 * A rectangle of an RGBA image shrunk to the given size by area averaging,
 * with colour weighted by alpha so transparent edges don't darken.
 */
export function shrink(src, srcWidth, rect, width, height) {
  const out = new Uint8Array(width * height * 4)
  const sx = rect.w / width
  const sy = rect.h / height
  for (let dy = 0; dy < height; dy++) {
    const y0 = dy * sy
    const y1 = y0 + sy
    for (let dx = 0; dx < width; dx++) {
      const x0 = dx * sx
      const x1 = x0 + sx
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let area = 0
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0)
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const w = wy * (Math.min(x + 1, x1) - Math.max(x, x0))
          const i = ((rect.y + y) * srcWidth + rect.x + x) * 4
          const alpha = src[i + 3] * w
          r += src[i] * alpha
          g += src[i + 1] * alpha
          b += src[i + 2] * alpha
          a += alpha
          area += w
        }
      }
      const o = (dy * width + dx) * 4
      if (a > 0) {
        out[o] = Math.round(r / a)
        out[o + 1] = Math.round(g / a)
        out[o + 2] = Math.round(b / a)
      }
      out[o + 3] = Math.round(a / area)
    }
  }
  return out
}
