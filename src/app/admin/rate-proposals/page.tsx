import type { Metadata } from 'next';
import { PanelHead } from '@/components/ui/Panel';
import { SHELL } from '@/components/ui/styles';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireAdmin } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { getRateLimits, negotiationCounts } from '@/server/rateNegotiations';
import { isPricingV2 } from '@/server/pricingModel';
import { PricingModelForm } from './PricingModelForm';
import { RateLimitsForm } from './RateLimitsForm';

export const metadata: Metadata = { title: 'Rate proposals' };
export const dynamic = 'force-dynamic';

const LABELS = [
  ['pending', 'Pending'],
  ['countered', 'Counter-proposed'],
  ['accepted', 'Accepted'],
  ['declined', 'Declined'],
  ['withdrawn', 'Withdrawn'],
  ['expired', 'Expired'],
] as const;

/**
 * Admin → Rate proposals (CR-13, FR-040.16 and .20), the Super Admin's alone: the limits, and
 * counts only. No negotiation's details, parties, amounts or messages are shown here.
 */
export default async function AdminRateProposalsPage() {
  const access = await requireAdmin('superadmin');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Rate proposals"
        body="Rate proposal limits work with the real database."
        homeHref="/admin"
        homeLabel="Back to home"
      />
    );
  }
  const [limits, counts, v2] = await Promise.all([getRateLimits(db()), negotiationCounts(db()), isPricingV2(db())]);
  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-6">
      <h1 className="text-headline-lg-mobile lg:text-headline-lg">Rate proposals</h1>
      <section aria-labelledby="limits" className={SHELL}>
        <PanelHead id="limits" title="Limits per parent" />
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          <p className="text-[15px] leading-[22px] text-on-surface-variant">
            Open means Pending or Counter-proposed. A day runs from midnight to midnight in the parent&apos;s own time
            zone. Counter-offers are not new proposals. Changes apply to the next proposal.
          </p>
          <RateLimitsForm activePerParent={limits.activePerParent} newPerDay={limits.newPerDay} />
        </div>
      </section>
      <section aria-labelledby="pricing-model" className={SHELL}>
        <PanelHead id="pricing-model" title={<>New pricing model (CR-15): {v2 ? 'on' : 'off'}</>} />
        <div className="flex flex-col gap-3 px-5 py-5 sm:px-6">
          <p className="text-[15px] leading-[22px] text-on-surface-variant">
            Hourly lessons and learning packages instead of weekly, fortnightly and monthly prices. Keep this off until
            the owner approves the release. Old prices are never deleted.
          </p>
          <PricingModelForm on={v2} />
        </div>
      </section>
      <section aria-labelledby="counts" className={SHELL}>
        <PanelHead id="counts" title="Counts" />
        <div className="flex flex-col gap-3 px-5 py-5 sm:px-6">
          <p className="text-sm text-on-surface-variant">
            Counts only. Negotiations are private to the parent and the teacher (FR-040.20).
          </p>
          <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {LABELS.map(([key, label]) => (
              <div key={key} className="rounded-[14px] bg-surface-container-low p-3">
                <dt className="text-sm text-on-surface-variant">{label}</dt>
                <dd className="m-0 text-[22px] font-bold">{counts[key]}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
