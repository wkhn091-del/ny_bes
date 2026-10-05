/**
 * The simulated residents of the neighbouring apartment tower in the 3D tour. Fictional names,
 * always shown with a "simulation" label; no real people or apartments are described.
 */
export type Resident = { apt: number; family: string; people: number; note: string };

export const RESIDENTS: readonly Resident[] = [
  { apt: 1, family: 'משפחת לוי', people: 4, note: 'זוג ושני ילדים' },
  { apt: 2, family: 'משפחת כהן', people: 2, note: 'זוג צעיר וחתול' },
  { apt: 3, family: 'משפחת מזרחי', people: 5, note: 'הורים ושלושה ילדים' },
  { apt: 4, family: 'נועה פרץ', people: 1, note: 'אדריכלית, עובדת מהבית' },
  { apt: 5, family: 'משפחת ביטון', people: 3, note: 'זוג ותינוקת' },
  { apt: 6, family: 'משפחת אברהם', people: 2, note: 'זוג גמלאים' },
  { apt: 7, family: 'משפחת פרידמן', people: 4, note: 'זוג, ילד וכלב' },
  { apt: 8, family: 'משפחת דהן', people: 3, note: 'פנטהאוז, זוג ובן' },
];

export const HOME_FLOORS = RESIDENTS.length;
export const RESIDENCE_NAME = 'Avenue Residences';
