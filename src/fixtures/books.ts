import type { SubjectId } from './subjects';

/** Sample books for the sample-data preview (CR-17 PR B1). Invented titles; no files behind them. */
export interface DemoBook {
  id: string;
  title: string;
  subject: SubjectId;
  form: 'single_pdf' | 'chapter_files';
  status: 'draft' | 'published';
  chapters: Array<{ number: number; title: string }>;
  children: string[];
}

export const DEMO_BOOKS: DemoBook[] = [
  {
    id: 'demo-book-1',
    title: 'Science practice book (made-up sample)',
    subject: 'science',
    form: 'single_pdf',
    status: 'published',
    chapters: [
      { number: 1, title: 'Plants around us (sample)' },
      { number: 2, title: 'Water in our lives (sample)' },
    ],
    children: ['Kiran'],
  },
  {
    id: 'demo-book-2',
    title: 'Maths workbook (made-up sample)',
    subject: 'maths',
    form: 'chapter_files',
    status: 'draft',
    chapters: [{ number: 1, title: 'Fractions (sample)' }],
    children: ['Kiran'],
  },
];
