/** Third-party assets that require visible attribution (CC BY). Mirrors docs/asset-licenses.md. */
export type Credit = { title: string; author: string; authorUrl: string; source: string; license: string; licenseUrl: string; use: string };

const CC_BY_4 = { license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' };

export const CREDITS: Credit[] = [
  {
    title: 'New York City',
    author: 'golukumar',
    authorUrl: 'https://sketchfab.com/mortalityrexotable',
    source: 'https://sketchfab.com/3d-models/new-york-city-4737b6ee73ed4634ad5b414558fdfa45',
    ...CC_BY_4,
    use: 'בלוקי הרחובות והבניינים סביב המגדל בסיור התלת־ממדי (מוקטן ודחוס לאתר, עם תאורת חלונות בלילה)',
  },
  {
    title: 'Minimalistic Modern Office',
    author: 'dylanheyes',
    authorUrl: 'https://sketchfab.com/dylanheyes',
    source: 'https://sketchfab.com/3d-models/minimalistic-modern-office-5540183da1c7452f810f8de33734879a',
    ...CC_BY_4,
    use: 'שולחן מנהלים, כיסא, שטיח ועציץ במשרדים הפרטיים (נלקחו רק הרהיטים, מפושטים ודחוסים)',
  },
  {
    title: 'free Loft 17 interior floors, view of the city.',
    author: 'dasy444',
    authorUrl: 'https://sketchfab.com/dasy444',
    source: 'https://sketchfab.com/3d-models/free-loft-17-interior-floors-view-of-the-city-1bc27584241b4078975b31dd4610d6e0',
    ...CC_BY_4,
    use: 'ספת העור, הכורסה, השולחן, השטיח והאגרטל בטרקלין של כל קומה (נלקחו רק הרהיטים)',
  },
];
