import DOMPurify from 'dompurify';

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a'];

export function sanitizeDescriptionHtml(input: string) {
  if (typeof window === 'undefined') return '';
  const clean = String(DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'img', 'svg', 'math'],
  }));
  if (typeof DOMParser === 'undefined') return clean;
  const documentValue = new DOMParser().parseFromString(clean, 'text/html');
  documentValue.querySelectorAll('a').forEach((anchor) => {
    const href = anchor.getAttribute('href') ?? '';
    if (!/^https?:\/\//i.test(href)) {
      anchor.removeAttribute('href');
      return;
    }
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noreferrer noopener');
  });
  return documentValue.body.innerHTML;
}
