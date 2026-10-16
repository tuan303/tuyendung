import createDOMPurify from 'dompurify';

/** Only absolute web links are accepted in editable content and public media. */
export function safeExternalUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return undefined;
  try {
    const url = new URL(value.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

let purifier: ReturnType<typeof createDOMPurify> | undefined;

/** Keep basic job formatting while dropping executable HTML, media and CSS. */
export function sanitizeRichHtml(value: unknown): string {
  if (typeof value !== 'string' || typeof window === 'undefined') return '';
  purifier ??= createDOMPurify(window);
  const clean = purifier.sanitize(value, {
    ALLOWED_TAGS: ['p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ol', 'ul', 'li', 'blockquote', 'h2', 'h3', 'a'],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    FORBID_CONTENTS: ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template'],
  });
  const template = document.createElement('template');
  template.innerHTML = clean;
  for (const anchor of template.content.querySelectorAll('a')) {
    const href = safeExternalUrl(anchor.getAttribute('href'));
    if (href) {
      anchor.setAttribute('href', href);
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
    } else {
      anchor.removeAttribute('href');
    }
  }
  return template.innerHTML;
}
