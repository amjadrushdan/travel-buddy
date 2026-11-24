// Shared guide types (server + browser).

export const CATEGORIES = [
  { key: "food", label: "Food" },
  { key: "prayer", label: "Prayer" },
  { key: "transport", label: "Transport" },
  { key: "phrases", label: "Phrases" },
  { key: "other", label: "Other" },
] as const;

export type Category = (typeof CATEGORIES)[number]["key"];

export type Guide = {
  id: string;
  category: Category;
  title: string;
  body_md: string;
};

export const GUIDE_COLUMNS = "id, category, title, body_md";

export const categoryLabel = (c: string) => CATEGORIES.find((x) => x.key === c)?.label ?? "Other";
export const isCategory = (c: string): c is Category => CATEGORIES.some((x) => x.key === c);
