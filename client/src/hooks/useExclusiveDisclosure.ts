import { useCallback, useState } from "react";

/**
 * Controller for "only one row open at a time" disclosure lists.
 *
 * Use for long lists of sibling rows where the user is scanning — track
 * rows on an album, future Fan orders rows, etc. Opening a new row
 * collapses whichever sibling was previously open, so the list never
 * turns into a wall of expanded detail blocks (Stripe's order-rows
 * pattern).
 *
 * Do NOT use for sidebar group sections or nested settings disclosures
 * (Player settings panels, etc.) — those want independent disclosure.
 *
 * Usage:
 *   const disclosure = useExclusiveDisclosure<string>();
 *   ...
 *   <Row
 *     expanded={disclosure.isOpen(row.id)}
 *     onSetExpanded={(open) => disclosure.setOpen(row.id, open)}
 *   />
 */
export function useExclusiveDisclosure<Id extends string | number = string>(
  initialOpenId: Id | null = null,
) {
  const [openId, setOpenId] = useState<Id | null>(initialOpenId);

  const isOpen = useCallback((id: Id) => openId === id, [openId]);

  const open = useCallback((id: Id) => setOpenId(id), []);

  const close = useCallback(() => setOpenId(null), []);

  const toggle = useCallback(
    (id: Id) => setOpenId((cur) => (cur === id ? null : id)),
    [],
  );

  const setOpen = useCallback((id: Id, next: boolean) => {
    setOpenId((cur) => {
      if (next) return id;
      return cur === id ? null : cur;
    });
  }, []);

  return { openId, isOpen, open, close, toggle, setOpen };
}
