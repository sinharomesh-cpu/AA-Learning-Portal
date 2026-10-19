import type { Metadata } from 'next';
import { PanelHead } from '@/components/ui/Panel';
import { SHELL } from '@/components/ui/styles';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireAdmin } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { type PlanItem, planPricingMigration } from '@/server/pricingMigration';
import { describeLessonPrice } from '@/lib/pricing';
import { isPricingV2 } from '@/server/pricingModel';
import { describePrice, formatAmount } from '@/lib/listing';
import { MigrationForm } from './MigrationForms';

export const metadata: Metadata = { title: 'Pricing migration' };
export const dynamic = 'force-dynamic';

const HOURLY: Record<PlanItem['hourly'], string> = {
  converted: 'Hourly rate kept and offered',
  kept_not_offered: 'Hourly rate kept, not offered (no usual time long enough)',
  already_set: 'Already set',
  none: '—',
};
const ISSUE: Record<string, string> = {
  details_missing: 'classes a week, period and times not stored',
  classes_below_minimum: 'fewer than 22 classes',
};

/**
 * Admin → Pricing migration (CR-15 step A5; FR-044; board PM8), the Super Admin's alone. The page
 * itself is the read-only dry run; applying and rolling back each need a typed confirmation.
 */
export default async function PricingMigrationPage() {
  const access = await requireAdmin('superadmin');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Pricing migration"
        body="The pricing migration works with the real database."
        homeHref="/admin"
        homeLabel="Back to home"
      />
    );
  }
  const [plan, v2] = await Promise.all([planPricingMigration(db()), isPricingV2(db())]);
  const t = plan.totals;
  const stat = (label: string, n: number) => (
    <div className="rounded-[14px] bg-surface-container-low p-3">
      <dt className="text-sm text-on-surface-variant">{label}</dt>
      <dd className="m-0 text-[22px] font-bold">{n}</dd>
    </div>
  );
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <h1 className="text-headline-lg-mobile lg:text-headline-lg">Pricing migration (CR-15)</h1>
      <section aria-labelledby="dry" className={SHELL}>
        <PanelHead id="dry" title="Dry run — nothing has changed" />
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          <p className="text-[15px] leading-[22px] text-on-surface-variant">
            What applying would do now. Hourly prices keep their amount; weekly and fortnightly prices are hidden from
            public listings; each monthly price becomes a fixed-price learning package in <strong>Needs review</strong>{' '}
            until the teacher adds the missing details. Earlier prices are never deleted. New pricing model:{' '}
            <strong>{v2 ? 'on' : 'off'}</strong>.
          </p>
          <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stat('Listings to convert', t.listings)}
            {stat('Hourly rates kept and offered', t.hourlyConverted)}
            {stat('Hourly kept, not offered', t.hourlyNotOffered)}
            {stat('Weekly prices hidden', t.hiddenWeekly)}
            {stat('Fortnightly prices hidden', t.hiddenBiweekly)}
            {stat('Packages needing review', t.packagesNeedReview)}
            {stat('…of which under 22 classes', t.belowMinimum)}
            {stat('Public listings updated', t.copiesChanged)}
            {stat('Skipped: teacher not approved / active', t.skipped)}
            {stat('Open proposals on earlier prices (continue)', t.openNegotiations)}
            {stat('Agreed rates on earlier prices (kept)', t.acceptedNegotiations)}
          </dl>
          <p className="text-sm text-on-surface-variant">
            Already converted earlier (skipped): {plan.alreadyConverted}.
          </p>
          <p className="text-sm text-on-surface-variant">
            Hourly lessons and learning packages stay independent: a converted hourly rate never sets a package price,
            and a converted package price is never worked out from an hourly rate. No package arrangements exist yet.
          </p>
          <div>
            <a href="/admin/pricing-migration/backup" className="font-bold text-primary underline" download>
              Download a backup of these records (JSON)
            </a>
          </div>
          {plan.items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[14px]">
                <caption className="sr-only">Listings and what would happen to each</caption>
                <thead>
                  <tr className="border-b-2 border-card-border">
                    <th scope="col" className="py-2 pr-3">
                      Listing
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      Earlier prices (unchanged in history)
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      Hourly
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      Hidden
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      Monthly → package
                    </th>
                    <th scope="col" className="py-2">
                      Public copy
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plan.items.map((i) => (
                    <tr key={i.listingId} className="border-b border-card-border align-top">
                      <th scope="row" className="py-2 pr-3 font-normal">
                        <strong>{i.teacherName}</strong>
                        <span className="block text-on-surface-variant">
                          {i.publicId} · {i.listingStatus}
                        </span>
                      </th>
                      <td className="py-2 pr-3">
                        <ul className="m-0 list-none p-0">
                          {i.oldPrices.map((p, n) => (
                            <li key={n}>{describePrice(p)}</li>
                          ))}
                        </ul>
                      </td>
                      <td className="py-2 pr-3">
                        {i.newHourly ? (
                          <strong className="block">
                            {formatAmount(i.newHourly.currency, i.newHourly.rateMinor)} per hour ·{' '}
                            {describeLessonPrice(i.newHourly.currency, i.newHourly.rateMinor, i.newHourly.minutes)}
                          </strong>
                        ) : null}
                        {HOURLY[i.hourly]}
                        {i.extraHourly ? ` (+${i.extraHourly} more kept in history)` : ''}
                      </td>
                      <td className="py-2 pr-3">
                        {[
                          i.hiddenWeekly ? `${i.hiddenWeekly} weekly` : '',
                          i.hiddenBiweekly ? `${i.hiddenBiweekly} fortnightly` : '',
                        ]
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </td>
                      <td className="py-2 pr-3">
                        {i.newPackage ? (
                          <strong className="block">
                            {formatAmount(i.newPackage.currency, i.newPackage.priceMinor)} · Fixed ·{' '}
                            {i.newPackage.classes ?? '?'} classes × {i.newPackage.minutes} min
                          </strong>
                        ) : null}
                        {i.package === 'needs_review'
                          ? `Needs review (not shown to parents): ${i.packageIssues.map((x) => ISSUE[x] ?? x).join('; ')}`
                          : i.package === 'package_exists'
                            ? 'Teacher already has a package (unchanged)'
                            : '—'}
                      </td>
                      <td className="py-2">
                        {i.skipped
                          ? 'Skipped: teacher not approved / active (listing already hidden)'
                          : i.copyChanges
                            ? 'Earlier prices removed'
                            : 'Unchanged'}
                        {i.negotiations.open || i.negotiations.accepted ? (
                          <span className="block text-on-surface-variant">
                            Proposals: {i.negotiations.open} open (continue), {i.negotiations.accepted} agreed (kept)
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[15px]">Nothing to convert.</p>
          )}
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="apply" className={SHELL}>
          <PanelHead id="apply" title="Convert and turn on" />
          <div className="flex flex-col gap-3 px-5 py-5 sm:px-6">
            <p className="text-[15px] leading-[22px]">
              Only after the owner has approved this report. Download the backup first. Each listing is converted in its
              own step and logged, then the new pricing model is turned on in the same step. If any listing fails, the
              model stays off. Running it again changes nothing.
            </p>
            <MigrationForm kind="apply" disabled={plan.items.length === 0} />
          </div>
        </section>
        <section aria-labelledby="rollback" className={SHELL}>
          <PanelHead id="rollback" title="Turn off and roll back" />
          <div className="flex flex-col gap-3 px-5 py-5 sm:px-6">
            <p className="text-[15px] leading-[22px]">
              Turns the new pricing model off, then restores every converted listing&apos;s public copy and hourly
              fields and removes packages still in Needs review. Packages a teacher has completed are kept.
            </p>
            <MigrationForm kind="rollback" disabled={plan.alreadyConverted === 0} />
          </div>
        </section>
      </div>
    </div>
  );
}
