import { memo, useState } from 'react';
import { CornerUpLeft, Pencil, SmilePlus, Trash2 } from 'lucide-react';
import { type Attachment, mascotByUserId, type Message } from '@pausa/shared';
import { t } from '../../i18n';
import { formatFull, formatTime } from '../../lib/format';
import { isJumboEmoji, renderMarkdown } from '../../lib/markdown';
import { CommunityCard } from '../community/CommunityCard';
import { plainText } from '../../lib/plaintext';
import { QUICK_REACTIONS } from '../../lib/emoji';
import { getStore, type PendingMessage, useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import { EmojiPicker } from '../composer/EmojiPicker';
import { Mascot } from '../mascots/Mascot';
import styles from './MessageItem.module.css';

interface Props {
  message: Message;
  grouped: boolean;
  highlighted: boolean;
  onDelete: (m: Message) => void;
  onOpenImage: (a: Attachment) => void;
}

export const MessageItem = memo(function MessageItem({
  message,
  grouped,
  highlighted,
  onDelete,
  onOpenImage,
}: Props) {
  const me = useChat((s) => s.me);
  const members = useChat((s) => s.members);
  const archived = useChat((s) => s.rooms[message.roomId]?.archivedAt != null);
  // Labels the room's mascot gave this person here (D-51), e.g. "nerd".
  const labels = useChat((s) => s.standings[message.roomId]?.[message.userId]?.labels);
  const [picker, setPicker] = useState(false);
  const store = getStore();
  const nameOf = (id: string) => members[id]?.displayName ?? store.nameOf(id);
  const author = nameOf(message.userId);
  const deleted = message.deletedAt !== null;
  const mine = message.userId === me.id;
  const staff = me.role === 'host' || me.role === 'admin';
  const mentionsMe = message.mentions.includes(me.id);
  const mascot = mascotByUserId(message.userId);

  return (
    <article
      className={styles.message}
      data-grouped={grouped || undefined}
      data-mention={mentionsMe || undefined}
      data-highlight={highlighted || undefined}
      data-mascot={mascot ? true : undefined}
      data-message-id={message.id}
      aria-label={author}
      // Focusable by tap (not by Tab), so touch screens can show the actions bar via :focus-within.
      tabIndex={-1}
    >
      {grouped && (
        <time
          className={`${styles.hoverTime} num`}
          dateTime={new Date(message.createdAt).toISOString()}
          title={formatFull(message.createdAt)}
        >
          {formatTime(message.createdAt)}
        </time>
      )}

      <div className={styles.content}>
        {!grouped && (
          <header className={styles.meta}>
            {mascot && <Mascot mascot={mascot.key} size={22} className={styles.mascot} />}
            <span className={styles.author}>{author}</span>
            {mascot && <span className={styles.tag}>{t('mascots.tag')}</span>}
            {labels && labels.length > 0 && (
              <span className={styles.label} title={t('moderation.labelTitle')}>
                {labels.join(' · ')}
              </span>
            )}
            <time
              className={`${styles.time} num`}
              dateTime={new Date(message.createdAt).toISOString()}
              title={formatFull(message.createdAt)}
            >
              {formatTime(message.createdAt)}
            </time>
          </header>
        )}

        {message.replyTo && !deleted && (
          <button
            type="button"
            className={styles.quote}
            onClick={() => void store.reveal(message.roomId, message.replyTo!.id)}
            aria-label={t('message.jumpToOriginal')}
          >
            <span className={styles.quoteAuthor}>{nameOf(message.replyTo.userId)}</span>
            <span className={styles.quoteText}>
              {message.replyTo.deleted
                ? t('message.replyDeleted')
                : plainText(message.replyTo.body, nameOf, 120) ||
                  (message.replyTo.hasAttachments ? t('message.replyImage') : '')}
            </span>
          </button>
        )}

        {deleted ? (
          <p className={styles.deleted}>{t('message.deleted')}</p>
        ) : (
          <>
            {message.body && (
              <div className={styles.body} data-jumbo={isJumboEmoji(message.body) || undefined}>
                {renderMarkdown(message.body, { nameOf, meId: me.id })}
                {message.card && <CommunityCard card={message.card} />}
                {message.editedAt && (
                  <span className={styles.edited}>{` (${t('message.edited')})`}</span>
                )}
              </div>
            )}
            {message.attachments.length > 0 && (
              <Attachments attachments={message.attachments} author={author} onOpen={onOpenImage} />
            )}
            {message.reactions.length > 0 && (
              <div className={styles.reactions}>
                {message.reactions.map((r) => {
                  const pressed = r.userIds.includes(me.id);
                  const names = r.userIds.map(nameOf).join(', ');
                  return (
                    <button
                      key={r.emoji}
                      type="button"
                      className={styles.reaction}
                      aria-pressed={pressed}
                      title={t('message.reactedBy', { names, emoji: r.emoji })}
                      aria-label={t('message.reactedBy', { names, emoji: r.emoji })}
                      disabled={archived}
                      onClick={() => void store.react(message.id, r.emoji)}
                    >
                      <span>{r.emoji}</span>
                      <span className="num">{r.userIds.length}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {!deleted && !archived && (
        <div
          className={styles.actions}
          role="toolbar"
          aria-label={t('message.actions')}
          data-open={picker || undefined}
        >
          {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={buttons.icon}
              aria-label={`${t('message.react')} ${emoji}`}
              onClick={() => void store.react(message.id, emoji)}
            >
              {emoji}
            </button>
          ))}
          <span className={styles.pickerAnchor}>
            <button
              type="button"
              className={buttons.icon}
              aria-label={t('message.react')}
              onClick={() => setPicker((p) => !p)}
            >
              <SmilePlus size={16} strokeWidth={1.75} aria-hidden />
            </button>
            {picker && (
              <EmojiPicker
                align="right"
                onPick={(emoji) => {
                  setPicker(false);
                  void store.react(message.id, emoji);
                }}
                onClose={() => setPicker(false)}
              />
            )}
          </span>
          <button
            type="button"
            className={buttons.icon}
            aria-label={t('message.reply')}
            onClick={() => store.setReplyTo(message.roomId, message)}
          >
            <CornerUpLeft size={16} strokeWidth={1.75} aria-hidden />
          </button>
          {mine && (
            <button
              type="button"
              className={buttons.icon}
              aria-label={t('message.edit')}
              onClick={() => store.setEditing(message.id)}
            >
              <Pencil size={16} strokeWidth={1.75} aria-hidden />
            </button>
          )}
          {(mine || staff) && (
            <button
              type="button"
              className={buttons.icon}
              aria-label={t('message.delete')}
              onClick={() => onDelete(message)}
            >
              <Trash2 size={16} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </div>
      )}
    </article>
  );
});

function Attachments({
  attachments,
  author,
  onOpen,
}: {
  attachments: Attachment[];
  author: string;
  onOpen: (a: Attachment) => void;
}) {
  const alt = t('message.image', { name: author });
  return (
    <div className={styles.images} data-count={Math.min(attachments.length, 4)}>
      {attachments.map((a) => (
        <button
          key={a.id}
          type="button"
          className={styles.imageButton}
          aria-label={t('message.openImage')}
          onClick={() => onOpen(a)}
        >
          <img
            src={a.url}
            alt={alt}
            loading="lazy"
            width={a.width ?? undefined}
            height={a.height ?? undefined}
            className={styles.image}
          />
        </button>
      ))}
    </div>
  );
}

/** My message on its way to the server (optimistic send). */
export function PendingItem({ pending }: { pending: PendingMessage }) {
  const me = useChat((s) => s.me);
  const members = useChat((s) => s.members);
  const store = getStore();
  const nameOf = (id: string) => members[id]?.displayName ?? store.nameOf(id);
  return (
    <article className={styles.message} data-pending={pending.status} aria-label={me.displayName}>
      <div className={styles.content}>
        <header className={styles.meta}>
          <span className={styles.author}>{me.displayName}</span>
          <span className={styles.time}>
            {pending.status === 'sending' ? t('message.sending') : ''}
          </span>
        </header>
        {pending.body && (
          <div className={styles.body}>{renderMarkdown(pending.body, { nameOf, meId: me.id })}</div>
        )}
        {pending.attachments.length > 0 && (
          <div className={styles.images} data-count={Math.min(pending.attachments.length, 4)}>
            {pending.attachments.map((a) => (
              <img
                key={a.id}
                src={a.url}
                alt=""
                className={styles.image}
                width={a.width ?? undefined}
                height={a.height ?? undefined}
              />
            ))}
          </div>
        )}
        {pending.status === 'failed' && (
          <p className={styles.failed} role="alert">
            {pending.error ? t(`errors.${pending.error}`) : t('message.failed')}{' '}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => store.retry(pending.clientId)}
            >
              {t('message.retry')}
            </button>
            {' · '}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => store.discard(pending.clientId)}
            >
              {t('message.discard')}
            </button>
          </p>
        )}
      </div>
    </article>
  );
}
