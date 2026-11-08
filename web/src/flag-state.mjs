// Keep existing row positions/references: toggling is not a list refresh or re-sort.
export function updateFlagInPlace(flags, updated) {
  return flags.map(flag => flag.id === updated.id ? updated : flag);
}
