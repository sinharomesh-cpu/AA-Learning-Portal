import { brand } from '@/config/brand';

export default function HomePage() {
  return (
    <main>
      <h1>{brand.productName}</h1>
      <p>Phase 1 is in progress. Sign-in and the role portals are not available yet.</p>
    </main>
  );
}
