import type { CashRegisterEntry } from '../../../shared/types';

export interface EntryGroup {
  /** Present when this is a real grouped transaction (>1 entries). */
  groupId?: string;
  /** Denormalized total of the group, taken from any of its entries. */
  total?: number;
  /** Entries that make up the group. For singletons this has length 1. */
  entries: CashRegisterEntry[];
}

export function groupEntries(entries: CashRegisterEntry[]): EntryGroup[] {
  const byId = new Map<string, EntryGroup>();
  const groups: EntryGroup[] = [];
  for (const entry of entries) {
    if (entry.paymentGroupId) {
      const key = `${entry.paymentGroupId}:${Boolean(entry.isDeleted)}`;
      let group = byId.get(key);
      if (!group) { group = { groupId: key, entries: [], total: 0 }; byId.set(key, group); groups.push(group); }
      group.entries.push(entry);
      group.total = (Math.round((group.total || 0) * 100) + Math.round(entry.amount * 100)) / 100;
    } else {
      groups.push({ entries: [entry] });
    }
  }
  return groups;
}
