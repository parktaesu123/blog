import saved from '../../site-design.json';
export interface SiteDesign { brand: string; avatar: string; headline: string; intro: string; accent: string; palette: 'ink' | 'paper' | 'night'; font: 'sans' | 'serif' | 'mono'; layout: 'list' | 'cards' | 'compact'; }
export const design = saved as SiteDesign;
