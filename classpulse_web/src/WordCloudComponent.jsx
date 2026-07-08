import { useMemo } from 'react';

const WORD_COLORS = [
  '#7dd3fc',
  '#67e8f9',
  '#5eead4',
  '#86efac',
  '#fcd34d',
  '#fca5a5',
  '#c4b5fd',
  '#f9a8d4',
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getWordValue(item) {
  return Number(item?.value ?? 0);
}

function getWordText(item) {
  return String(item?.text ?? '').trim();
}

function hashWord(word) {
  let hash = 0;
  for (let i = 0; i < word.length; i += 1) {
    hash = (hash << 5) - hash + word.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function computeFontSize(value, minCount, maxCount, minSize, maxSize) {
  if (maxCount === minCount) {
    return 36;
  }

  const ratio = (value - minCount) / (maxCount - minCount);
  return Math.round(minSize + ratio * (maxSize - minSize));
}

function estimateTextBox(x, y, fontSize, word) {
  const width = Math.max(fontSize * 1.15 * String(word || '').length, fontSize * 1.9);
  const height = fontSize * 1.22;
  return {
    left: x - width / 2,
    right: x + width / 2,
    top: y - height,
    bottom: y,
  };
}

function overlaps(a, b, padding = 6) {
  return !(
    a.right + padding < b.left
    || a.left > b.right + padding
    || a.bottom + padding < b.top
    || a.top > b.bottom + padding
  );
}

export default function WordCloudComponent({
  data = [],
  width = 900,
  height = 520,
  className = '',
}) {
  const words = useMemo(() => {
    if (!Array.isArray(data)) {
      return [];
    }

    const normalized = data
      .map((item) => ({
        text: getWordText(item).toLowerCase(),
        value: Math.max(0, Math.round(getWordValue(item))),
      }))
      .filter((item) => item.text && item.value > 0)
      .sort((a, b) => b.value - a.value || a.text.localeCompare(b.text));

    return normalized;
  }, [data]);

  const layout = useMemo(() => {
    if (!words.length) {
      return [];
    }

    const values = words.map((item) => item.value);
    const minCount = Math.min(...values);
    const maxCount = Math.max(...values);

    const placed = [];
    const out = [];

    const cx = width / 2;
    const cy = height / 2;
    const safeLeft = 24;
    const safeRight = width - 24;
    const safeTop = 28;
    const safeBottom = height - 20;

    const radialStep = 16;
    const angleStep = Math.PI / 15;
    const sizeScale = clamp(Math.sqrt((width * height) / (900 * 520)), 0.75, 1.9);
    const minFontSize = Math.round(22 * sizeScale);
    const maxFontSize = Math.round(72 * sizeScale);

    words.forEach((item, index) => {
      const baseSize = computeFontSize(item.value, minCount, maxCount, minFontSize, maxFontSize);
      const fontSize = clamp(baseSize, 18, 110);
      const color = WORD_COLORS[hashWord(item.text) % WORD_COLORS.length];

      let chosenX = cx;
      let chosenY = cy;
      let chosenBox = estimateTextBox(chosenX, chosenY, fontSize, item.text);

      if (index !== 0) {
        let found = false;

        for (let radius = 20; radius < Math.min(width, height); radius += radialStep) {
          for (let angle = 0; angle < Math.PI * 2; angle += angleStep) {
            const x = cx + Math.cos(angle + index * 0.45) * radius;
            const y = cy + Math.sin(angle + index * 0.45) * radius;
            const box = estimateTextBox(x, y, fontSize, item.text);

            if (box.left < safeLeft || box.right > safeRight || box.top < safeTop || box.bottom > safeBottom) {
              continue;
            }

            if (placed.some((existing) => overlaps(box, existing))) {
              continue;
            }

            chosenX = x;
            chosenY = y;
            chosenBox = box;
            found = true;
            break;
          }

          if (found) {
            break;
          }
        }
      }

      placed.push(chosenBox);
      out.push({
        ...item,
        x: chosenX,
        y: chosenY,
        fontSize,
        color,
      });
    });

    return out;
  }, [words, width, height]);

  if (!layout.length) {
    return (
      <div className={`flex h-full w-full items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/70 ${className}`}>
        <p className="text-sm text-slate-400">Generate a word cloud to render terms for this question.</p>
      </div>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Word cloud"
      className={`h-full w-full ${className}`.trim()}
    >
      <rect x="0" y="0" width={width} height={height} rx="20" fill="#020617" />
      {layout.map((item, index) => (
        <text
          key={`${item.text}-${index}`}
          x={item.x}
          y={item.y}
          textAnchor="middle"
          fontSize={item.fontSize}
          fontWeight={index === 0 ? 800 : 600}
          fill={item.color}
          fontFamily="Segoe UI, Tahoma, sans-serif"
        >
          {item.text}
        </text>
      ))}
    </svg>
  );
}
