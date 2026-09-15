export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function paginate<T>(all: T[], page: number, pageSize: number): Page<T> {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safeSize = Math.min(25, Math.max(1, Math.floor(pageSize) || 10));
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / safeSize));
  const clamped = Math.min(safePage, totalPages);
  const start = (clamped - 1) * safeSize;
  return {
    items: all.slice(start, start + safeSize),
    page: clamped,
    pageSize: safeSize,
    total,
    totalPages,
  };
}

export function pageButtons(customIdBase: string, page: number, totalPages: number): { prevId: string; nextId: string } {
  return {
    prevId: `${customIdBase}:page:${Math.max(1, page - 1)}`,
    nextId: `${customIdBase}:page:${Math.min(totalPages, page + 1)}`,
  };
}
