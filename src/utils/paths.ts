export function sitePath(path = '') {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function tagPath(tag: string) {
  return sitePath(`tags/${encodeURIComponent(tag)}/`);
}

export function categoryPath(id: string) {
  return sitePath(`categories/${encodeURIComponent(id)}/`);
}

/** The owner's introduction is a regular document published at /about/. */
export const INTRODUCTION_SLUG = 'about';

export function isIntroduction(id: string) {
  // Older introductions were published at the site root with slug "index".
  return id === INTRODUCTION_SLUG || id === '' || id === '/' || id === 'index';
}
