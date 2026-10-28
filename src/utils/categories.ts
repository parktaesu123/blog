import defaults from '../data/categories.json';

export interface Category { id: string; label: string; }
export interface CategoryConfig { categories: Category[]; redirects: Record<string, string>; }
export const categoryConfig: CategoryConfig = defaults;

export function resolveCategory(id: string, config: CategoryConfig = categoryConfig) {
  const mapped = Object.hasOwn(config.redirects, id) ? config.redirects[id] : id;
  return config.categories.find((item) => item.id === mapped) ?? config.categories[0];
}
