/** Which users have at least one connected socket. In memory: presence is not worth persisting. */
export class Presence {
  private sockets = new Map<string, Set<string>>();

  /** Returns true if this made the user go online. */
  add(userId: string, socketId: string): boolean {
    let set = this.sockets.get(userId);
    const wasOffline = !set || set.size === 0;
    if (!set) this.sockets.set(userId, (set = new Set()));
    set.add(socketId);
    return wasOffline;
  }

  /** Returns true if this made the user go offline. */
  remove(userId: string, socketId: string): boolean {
    const set = this.sockets.get(userId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size > 0) return false;
    this.sockets.delete(userId);
    return true;
  }

  isOnline(userId: string): boolean {
    return (this.sockets.get(userId)?.size ?? 0) > 0;
  }
}
