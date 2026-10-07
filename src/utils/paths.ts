export function sitePath(path = '') {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function tagPath(tag: string) {
  return sitePath(`tags/${encodeURIComponent(tag)}/`);
}
