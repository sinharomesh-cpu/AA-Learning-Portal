import { brand, pageTitle } from './brand';

describe('brand configuration', () => {
  it('uses the approved AA Pro names (OC-01)', () => {
    expect(brand.productName).toBe('AA Pro');
    expect(brand.tutorNameFull).toBe('AA Pro AI Tutor');
    expect(brand.tutorNameShort).toBe('AI Tutor');
  });

  it('builds page titles from the central brand', () => {
    expect(pageTitle()).toBe('AA Pro');
    expect(pageTitle('Home')).toBe('Home · AA Pro');
  });
});
