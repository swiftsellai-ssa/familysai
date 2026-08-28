function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMd(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

/** Conservative markdown → HTML. Escape first. Matches worker print. */
export function houseMdToHtml(md) {
  const lines = escapeHtml(String(md ?? '').replace(/\r\n/g, '\n')).split('\n');
  const out = [];
  let inOl = false;
  let para = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inlineMd(para.join(' '))}</p>`);
      para = [];
    }
  };
  const closeOl = () => {
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushPara();
      closeOl();
      const n = heading[1].length;
      out.push(`<h${n}>${inlineMd(heading[2])}</h${n}>`);
      continue;
    }
    const li = line.match(/^\d+\.\s+(.+)$/);
    if (li) {
      flushPara();
      if (!inOl) {
        out.push('<ol>');
        inOl = true;
      }
      out.push(`<li>${inlineMd(li[1])}</li>`);
      continue;
    }
    if (line.trim() === '') {
      flushPara();
      closeOl();
      continue;
    }
    closeOl();
    para.push(line);
  }
  flushPara();
  closeOl();
  return out.join('\n');
}
