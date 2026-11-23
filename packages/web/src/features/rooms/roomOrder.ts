import type { RoomView } from '@pausa/shared';

const byName = (a: RoomView, b: RoomView) =>
  a.name.localeCompare(b.name, 'pt-PT', { sensitivity: 'base' });

/** Sidebar order: #geral first, then by name. Hidden and archived rooms excluded. */
export function visibleRooms(rooms: Record<string, RoomView>): RoomView[] {
  return Object.values(rooms)
    .filter((r) => !r.hidden && !r.archivedAt)
    .sort((a, b) => Number(b.isMain) - Number(a.isMain) || byName(a, b));
}

export function hiddenRooms(rooms: Record<string, RoomView>): RoomView[] {
  return Object.values(rooms)
    .filter((r) => r.hidden && !r.archivedAt)
    .sort(byName);
}

export function archivedRooms(rooms: Record<string, RoomView>): RoomView[] {
  return Object.values(rooms)
    .filter((r) => r.archivedAt)
    .sort(byName);
}
