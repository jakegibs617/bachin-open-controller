# Image Detail Improvement Plan

## Current Bottlenecks

1. **Hard resolution cap** - "ultra" previously topped out at 560px. A 2000px source photo was crushed 4x before tracing.
2. **Global luminance threshold** - one cutoff value for the whole image. Photos with uneven lighting or gradients could lose structure.
3. **No preprocessing** - raw JPEG pixels went straight to the tracer. Noise, compression artifacts, and soft edges all degraded results.
4. **Binary-only output** - all tonal information was discarded; midtones required threshold tweaking.
5. **No path smoothing** - marching-squares and scanline output stayed pixel-grid aligned, producing staircase artifacts at non-horizontal/vertical edges.

---

## Implemented Changes

### Phase 1 - Quick wins [x]
- [x] Raised resolution caps: `Ultra` now traces at `1024`, and `Max` traces at `2048`.
- [x] Added configurable Gaussian blur preprocessing in `src/importers/raster/index.ts`.
- [x] Added brightness and contrast sliders in `src/ui/pages/Canvas.tsx`.

### Phase 2 - Adaptive thresholding [x]
- [x] Added local mean adaptive thresholding in `src/importers/raster/index.ts`.
- [x] Added an `Adaptive` toggle to raster trace options in `src/ui/pages/Canvas.tsx`.

### Phase 3 - Floyd-Steinberg dithering mode [x]
- [x] Added a fourth trace mode: `dither`.
- [x] Added Floyd-Steinberg error diffusion before the existing fill scanline tracer.
- [x] Added a `Dither` option to the raster mode dropdown.

### Phase 4 - Path smoothing (Douglas-Peucker) [x]
- [x] Added `smoothPaths()` Douglas-Peucker post-processing.
- [x] Added a configurable `Smooth` tolerance slider.
- [x] Applied smoothing after `traceRasterToPaths()` during raster import.

---

## Key Files

- `src/importers/raster/index.ts` - tracing engine, preprocessing, adaptive thresholding, dithering, smoothing
- `src/ui/pages/Canvas.tsx` - UI controls, image loading, trace options
- `tests/raster-import.test.ts` - raster tracing behavior coverage
- `src/core/gcode/index.ts` - G-code generation (downstream, no changes needed)
