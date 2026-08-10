// Ports FlowFormDemo/Services/LimsGradeData.cs — a static fixed in-memory dataset simulating an
// external LIMS system, no database/real API behind it.
export interface LimsSpec {
  attribute: string;
  method: string;
  standard: string;
}

export interface LimsGrade {
  code: string;
  description: string;
  specs: LimsSpec[];
}

const GRADES: LimsGrade[] = [
  {
    code: 'H5604',
    description: 'HDPE film grade',
    specs: [
      { attribute: 'Melt Index', method: 'ASTM D1238', standard: '0.5-1.0 g/10min' },
      { attribute: 'Density', method: 'ASTM D792', standard: '0.954-0.958 g/cm3' },
      { attribute: 'Ash content', method: 'ASTM D5630', standard: 'max 0.03%' },
    ],
  },
  {
    code: 'H4560',
    description: 'HDPE blow moulding grade',
    specs: [
      { attribute: 'Melt Index', method: 'ASTM D1238', standard: '0.35-0.55 g/10min' },
      { attribute: 'Density', method: 'ASTM D792', standard: '0.945-0.949 g/cm3' },
      { attribute: 'Ash content', method: 'ASTM D5630', standard: 'max 0.03%' },
    ],
  },
  {
    code: 'P3125',
    description: 'PP homopolymer grade',
    specs: [
      { attribute: 'Melt Index', method: 'ASTM D1238', standard: '10-14 g/10min' },
      { attribute: 'Density', method: 'ASTM D792', standard: '0.900-0.905 g/cm3' },
      { attribute: 'Ash content', method: 'ASTM D5630', standard: 'max 0.02%' },
    ],
  },
];

export function findLimsGrade(code: string): LimsGrade | undefined {
  const normalized = code.trim().toLowerCase();
  return GRADES.find((g) => g.code.toLowerCase() === normalized);
}
