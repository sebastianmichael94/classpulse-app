import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export default function LatexText({ text }) {
  if (typeof text !== 'string') {
    return null;
  }

  if (!text.includes('$$')) {
    return <span>{text}</span>;
  }

  const parts = text.split('$$');

  return (
    <span>
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          try {
            return (
              <span
                key={index}
                className="mx-1 inline-block align-middle"
                dangerouslySetInnerHTML={{ __html: katex.renderToString(part, { throwOnError: false }) }}
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
