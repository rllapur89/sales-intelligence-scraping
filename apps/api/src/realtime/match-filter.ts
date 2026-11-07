import type { LeadDto, SubscriptionFilter } from '@leads/shared';

/** Empty array = any. industry/region are exact matches; signalTypes need any overlap. */
export function matchesFilter(lead: LeadDto, filter: SubscriptionFilter): boolean {
  if (lead.score < filter.minScore) return false;
  if (filter.industries.length > 0) {
    const industry = lead.company.industry;
    if (industry === null || !filter.industries.includes(industry)) return false;
  }
  if (filter.regions.length > 0) {
    const region = lead.company.region;
    if (region === null || !filter.regions.includes(region)) return false;
  }
  if (filter.signalTypes.length > 0) {
    if (!lead.signalTypes.some((t) => filter.signalTypes.includes(t))) return false;
  }
  return true;
}

/** A user sees a lead if ANY active subscription matches; no subscriptions = nothing. */
export function matchesAny(lead: LeadDto, filters: readonly SubscriptionFilter[]): boolean {
  return filters.some((f) => matchesFilter(lead, f));
}
