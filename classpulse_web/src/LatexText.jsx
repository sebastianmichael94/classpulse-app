import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export default function LatexText({ text }) {
  if (typeof text !== 'string') {
    return null;
  }

  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+\$)/g).filter(Boolean);

  return (
    <span>
      {parts.map((part, index) => {
        const isBlockMath = part.startsWith('$$') && part.endsWith('$$');
        const isInlineMath = part.startsWith('$') && part.endsWith('$') && !isBlockMath;

        if (isBlockMath || isInlineMath) {
          try {
            const mathExpression = isBlockMath ? part.slice(2, -2) : part.slice(1, -1);
            return (
              <span
                key={index}
                className="mx-1 inline-block align-middle"
                dangerouslySetInnerHTML={{ __html: katex.renderToString(mathExpression, { throwOnError: false, displayMode: isBlockMath }) }}
              />
            );
          } catch {
            return <span key={index}>{part}</span>;
          }
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
}
