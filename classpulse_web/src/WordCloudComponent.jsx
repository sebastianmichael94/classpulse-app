import { useId, useMemo, useState } from 'react';
import './WordCloudComponent.css';

const WORD_COLORS = [
  '#38bdf8',
  '#22d3ee',
  '#2dd4bf',
  '#34d399',
  '#f59e0b',
  '#fb7185',
  '#a78bfa',
  '#f472b6',
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
  const gradientId = useId();
  const [hoveredWordKey, setHoveredWordKey] = useState(null);

  const words = useMemo(() => {
    if (!Array.isArray(data)) {
      return [];
    }

    const normalized = data
      .map((item) => ({
        text: getWordText(item),
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
    const minFontSize = Math.round(20 * sizeScale);
    const maxFontSize = Math.round(86 * sizeScale);

    words.forEach((item, index) => {
      const baseSize = computeFontSize(item.value, minCount, maxCount, minFontSize, maxFontSize);
      const fontSize = clamp(baseSize, 18, 110);
      const color = WORD_COLORS[hashWord(item.text) % WORD_COLORS.length];
      const spinSeed = hashWord(`${item.text}-${index}`) % 10;
      const rotation = index > 0 && spinSeed > 6 ? (spinSeed % 2 === 0 ? 14 : -14) : 0;

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
        key: `${item.text}-${index}`,
        x: chosenX,
        y: chosenY,
        fontSize,
        color,
        rotation,
      });
    });

    return out;
  }, [words, width, height]);

  const hoveredWord = useMemo(
    () => layout.find((item) => item.key === hoveredWordKey) || null,
    [layout, hoveredWordKey]
  );

  if (!layout.length) {
    return (
      <div className={`word-cloud-shell flex h-full w-full items-center justify-center rounded-2xl border border-border bg-background/70 ${className}`}>
        <p className="text-sm text-muted-foreground">Generate a word cloud to render terms for this question.</p>
      </div>
    );
  }

  return (
    <div className={`word-cloud-shell relative overflow-hidden rounded-2xl ${className}`.trim()}>
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-full border border-white/20 bg-slate-950/45 px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-slate-100 backdrop-blur-md">
        {hoveredWord ? `${hoveredWord.text} • ${hoveredWord.value}` : 'Hover a term'}
      </div>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Word cloud"
        className="h-full w-full"
      >
        <defs>
          <linearGradient id={`${gradientId}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#031225" />
            <stop offset="45%" stopColor="#04243d" />
            <stop offset="100%" stopColor="#120b2f" />
          </linearGradient>
          <radialGradient id={`${gradientId}-spot`} cx="50%" cy="44%" r="58%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
          <filter id={`${gradientId}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#67e8f9" floodOpacity="0.45" />
          </filter>
        </defs>

        <rect x="0" y="0" width={width} height={height} rx="20" fill={`url(#${gradientId}-bg)`} />
        <rect x="0" y="0" width={width} height={height} rx="20" fill={`url(#${gradientId}-spot)`} />
        <circle cx={width * 0.16} cy={height * 0.2} r={width * 0.18} fill="#22d3ee" opacity="0.08" />
        <circle cx={width * 0.88} cy={height * 0.75} r={width * 0.14} fill="#a78bfa" opacity="0.08" />

        {layout.map((item, index) => {
          const isHovered = hoveredWordKey === item.key;

          return (
            <text
              key={item.key}
              x={item.x}
              y={item.y}
              textAnchor="middle"
              fontSize={item.fontSize}
              fontWeight={index === 0 ? 800 : 650}
              fill={item.color}
              transform={`rotate(${item.rotation}, ${item.x}, ${item.y})`}
              fontFamily="Sora, Segoe UI, Tahoma, sans-serif"
              className={`word-cloud-term${isHovered ? ' is-hovered' : ''}`}
              style={{ animationDelay: `${index * 80}ms` }}
              filter={isHovered ? `url(#${gradientId}-glow)` : undefined}
              onMouseEnter={() => setHoveredWordKey(item.key)}
              onMouseLeave={() => setHoveredWordKey(null)}
            >
              <title>{`${item.text}: ${item.value}`}</title>
              {item.text}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
