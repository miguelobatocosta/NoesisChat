import { useCallback } from 'react';
import { mascotByKey, type MascotKey } from '@pausa/shared';
import { useChat } from '../../state/store';
import { useHostMascot } from './MascotSays';

/** Me, my person on the cake/office board (if any), and whether I can do the admin bits. */
export function useMe() {
  const me = useChat((s) => s.me);
  const person = useChat((s) => s.community?.people.find((p) => p.userId === me.id));
  return { me, person, staff: me.role === 'host' || me.role === 'admin' };
}

/** A person's current name by id ('?' if they're gone). */
export function useNameOf(): (personId: string) => string {
  const people = useChat((s) => s.community?.people);
  return useCallback(
    (personId: string) => people?.find((p) => p.id === personId)?.name ?? '?',
    [people],
  );
}

/** The #geral mascot that comments on both pages, with the name the host gave it. */
export function useHostMascotName(): { mascot: MascotKey; name: string } {
  const mascot = useHostMascot();
  const name = useChat(
    (s) => s.members[mascotByKey(mascot).userId]?.displayName ?? mascotByKey(mascot).name,
  );
  return { mascot, name };
}
