// Coordinates are kept until tiles are joined. Text-only concatenation loses
// label/value relationships in checkout tables and duplicates tile boundaries.
export function ocrLines(page) {
  return (page.blocks || [])
    .flatMap((block) =>
      (block.paragraphs || []).flatMap((paragraph) =>
        (paragraph.lines || []).flatMap((line) => {
          const words = line.words || [];
          if (!words.length)
            return [
              {
                text: line.text.trim().replace(/\s+/g, " "),
                confidence: line.confidence,
                bbox: { ...line.bbox },
              },
            ];
          const groups = [];
          for (const word of words) {
            const last = groups.at(-1);
            // A large gutter separates the amount column from its label. Keeping
            // those crops separate makes single-line re-recognition much cleaner.
            if (
              !last ||
              word.bbox.x0 - last.at(-1).bbox.x1 >
                Math.max(40, (line.bbox.y1 - line.bbox.y0) * 3)
            )
              groups.push([word]);
            else last.push(word);
          }
          if (groups.length === 1)
            return [
              {
                text: line.text.trim().replace(/\s+/g, " "),
                confidence: line.confidence,
                bbox: { ...line.bbox },
              },
            ];
          return groups.map((group) => ({
            text: group
              .map((w) => w.text)
              .join(" ")
              .trim(),
            confidence:
              group.reduce((sum, w) => sum + w.confidence, 0) / group.length,
            bbox: {
              x0: group[0].bbox.x0,
              x1: group.at(-1).bbox.x1,
              y0: Math.min(...group.map((w) => w.bbox.y0)),
              y1: Math.max(...group.map((w) => w.bbox.y1)),
            },
          }));
        }),
      ),
    )
    .filter((line) => line.text && line.bbox.y1 > line.bbox.y0);
}

export function readingRows(lines) {
  const rows = [];
  for (const line of [...lines].sort(
    (a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0,
  )) {
    const b = line.bbox;
    const row = rows.findLast((r) => {
      const overlap = Math.min(r.bbox.y1, b.y1) - Math.max(r.bbox.y0, b.y0);
      return overlap >= Math.min(r.bbox.y1 - r.bbox.y0, b.y1 - b.y0) * 0.65;
    });
    if (row) {
      row.parts.push(line);
      row.bbox = {
        x0: Math.min(row.bbox.x0, b.x0),
        y0: Math.min(row.bbox.y0, b.y0),
        x1: Math.max(row.bbox.x1, b.x1),
        y1: Math.max(row.bbox.y1, b.y1),
      };
    } else rows.push({ parts: [line], bbox: { ...b } });
  }
  return rows.map((row) => {
    const parts = row.parts.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const length = parts.reduce((sum, p) => sum + p.text.length, 0);
    return {
      text: parts.map((p) => p.text).join(" "),
      confidence:
        parts.reduce((sum, p) => sum + p.confidence * p.text.length, 0) /
        length,
      bbox: row.bbox,
    };
  });
}

export function tileOcrLines(
  lines,
  { top, height, imageHeight, scale, padding, overlap },
) {
  // Each tile owns half of its overlapping area. This also discards clipped
  // text at a tile edge without removing repeated products elsewhere.
  const minY = top === 0 ? 0 : top + overlap / 2;
  const maxY =
    top + height >= imageHeight ? imageHeight : top + height - overlap / 2;
  return lines
    .map((line) => ({
      ...line,
      bbox: {
        x0: (line.bbox.x0 - padding) / scale,
        x1: (line.bbox.x1 - padding) / scale,
        y0: (line.bbox.y0 - padding) / scale + top,
        y1: (line.bbox.y1 - padding) / scale + top,
      },
    }))
    .filter(
      ({ bbox }) =>
        (bbox.y0 + bbox.y1) / 2 >= minY && (bbox.y0 + bbox.y1) / 2 < maxY,
    );
}

// Grayscale contrast stretching preserves anti-aliased strokes, unlike a hard
// black/white threshold. Percentiles prevent a single logo/photo dominating.
export function enhanceOcrPixels(rgba, darkOnly = false) {
  const histogram = new Uint32Array(256);
  const luminance = (i) =>
    Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
  for (let i = 0; i < rgba.length; i += 4) histogram[luminance(i)]++;
  const pixels = rgba.length / 4;
  const percentile = (fraction) => {
    let total = 0;
    for (let i = 0; i < 256; i++) {
      total += histogram[i];
      if (total >= pixels * fraction) return i;
    }
    return 255;
  };
  const inverted = percentile(0.6) < 100;
  if (darkOnly && !inverted) return { inverted };
  const low = inverted ? 255 - percentile(0.99) : percentile(0.01);
  const high = inverted ? 255 - percentile(0.01) : percentile(0.99);
  const stretch = high - low >= 20;
  for (let i = 0; i < rgba.length; i += 4) {
    const gray = inverted ? 255 - luminance(i) : luminance(i);
    const value = stretch
      ? Math.round(((gray - low) * 255) / (high - low))
      : gray;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = Math.max(0, Math.min(255, value));
    rgba[i + 3] = 255;
  }
  return { inverted };
}
