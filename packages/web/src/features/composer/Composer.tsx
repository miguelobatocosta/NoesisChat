import {
  type ChangeEvent,
  type ClipboardEvent,
  forwardRef,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ImagePlus, SendHorizontal, Smile, X } from 'lucide-react';
import { type Attachment, LIMITS, type Member } from '@pausa/shared';
import { errorCode } from '../../api/errors';
import { uploadImage } from '../../api/http';
import { t } from '../../i18n';
import { searchEmoji } from '../../lib/emoji';
import { formatTime } from '../../lib/format';
import { isAcceptedImage, prepareImage } from '../../lib/imageprep';
import { findTrigger, fromWire, toWire, type Trigger } from '../../lib/mentions';
import { plainText } from '../../lib/plaintext';
import { getStore, useChat } from '../../state/store';
import buttons from '../../ui/buttons.module.css';
import styles from './Composer.module.css';
import { EmojiPicker } from './EmojiPicker';

export interface ComposerHandle {
  addFiles: (files: File[]) => void;
}

interface Upload {
  localId: string;
  previewUrl: string;
  progress: number;
  attachment?: Attachment;
  failed?: boolean;
  abort: AbortController;
}

/** Client-side cap mirrors the server default (UPLOAD_MAX_MB=10); the server stays the authority. */
const MAX_UPLOAD_MB = 10;
/** Drafts survive switching rooms. */
const drafts = new Map<string, string>();

type Suggestion = { key: string; label: string; detail?: string; insert: string; member?: Member };

export const Composer = forwardRef<
  ComposerHandle,
  {
    roomId: string;
    roomName: string;
    disabled: boolean;
    /** A mascot muted me here (D-51): reading is fine, writing isn't. */
    muted?: { until: number; topic: string } | null;
  }
>(function Composer({ roomId, roomName, disabled: archived, muted = null }, ref) {
  const disabled = archived || muted !== null;
  const store = getStore();
  const members = useChat((s) => s.members);
  const me = useChat((s) => s.me);
  const replyTo = useChat((s) => s.replyTo[roomId] ?? null);
  const editingId = useChat((s) => s.editingId);
  const timeline = useChat((s) => s.timelines[roomId]);

  const [text, setText] = useState(() => drafts.get(roomId) ?? '');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [selected, setSelected] = useState(0);
  const [picker, setPicker] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  /** Caret position to restore after the next text update (suggestions, emoji insert). */
  const caretAfterUpdate = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const memberList = useMemo(() => Object.values(members), [members]);
  const nameOf = useCallback(
    (id: string) => members[id]?.displayName ?? store.nameOf(id),
    [members, store],
  );

  const editing = useMemo(
    () =>
      editingId
        ? timeline?.messages.find((m) => m.id === editingId && m.roomId === roomId)
        : undefined,
    [editingId, timeline, roomId],
  );

  useEffect(() => {
    drafts.set(roomId, text);
  }, [roomId, text]);

  // Entering edit mode loads the message into the box; leaving it restores the draft.
  const draftBeforeEdit = useRef('');
  const wasEditing = useRef<string | null>(null);
  useEffect(() => {
    if (editing && wasEditing.current !== editing.id) {
      if (!wasEditing.current) draftBeforeEdit.current = text;
      setText(fromWire(editing.body ?? '', nameOf));
      wasEditing.current = editing.id;
      area.current?.focus();
    } else if (!editing && wasEditing.current) {
      setText(draftBeforeEdit.current);
      wasEditing.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  useEffect(() => {
    if (replyTo) area.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    if (!disabled) area.current?.focus();
  }, [roomId, disabled]);

  // Auto-grow up to ~8 lines, and put the caret where an insertion asked for it.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    if (caretAfterUpdate.current !== null) {
      el.focus();
      el.setSelectionRange(caretAfterUpdate.current, caretAfterUpdate.current);
      caretAfterUpdate.current = null;
    }
  }, [text]);

  useEffect(() => () => uploads.forEach((u) => URL.revokeObjectURL(u.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trigger) return [];
    if (trigger.kind === 'mention') {
      const q = trigger.query.toLocaleLowerCase('pt-PT');
      return memberList
        .filter(
          (m) => m.active && m.id !== me.id && m.displayName.toLocaleLowerCase('pt-PT').includes(q),
        )
        .slice(0, 6)
        .map((m) => ({ key: m.id, label: m.displayName, insert: `@${m.displayName} `, member: m }));
    }
    return searchEmoji(trigger.query, 6).map((e) => ({
      key: e.code,
      label: e.char,
      detail: `:${e.code}:`,
      insert: `${e.char} `,
    }));
  }, [trigger, memberList, me.id]);

  function updateTrigger(value: string, caret: number) {
    const next = findTrigger(value, caret);
    setTrigger(next);
    setSelected(0);
  }

  function applySuggestion(s: Suggestion) {
    if (!trigger) return;
    const caret = area.current?.selectionStart ?? text.length;
    caretAfterUpdate.current = trigger.start + s.insert.length;
    setText(text.slice(0, trigger.start) + s.insert + text.slice(caret));
    setTrigger(null);
  }

  function insertAtCaret(value: string) {
    const el = area.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    caretAfterUpdate.current = start + value.length;
    setText(text.slice(0, start) + value + text.slice(end));
  }

  const uploading = uploads.some((u) => !u.attachment && !u.failed);
  const ready = uploads.filter((u) => u.attachment).map((u) => u.attachment!);
  const canSend = !disabled && !uploading && (text.trim().length > 0 || ready.length > 0);

  function submit() {
    if (editing) {
      const body = toWire(text, memberList).trim();
      if (!body && editing.attachments.length === 0) return;
      void store.edit(editing.id, body);
      return;
    }
    if (!canSend) return;
    const body = toWire(text, memberList).trim();
    if (body.length > LIMITS.messageLength) {
      store.showError('VALIDATION');
      return;
    }
    store.send(roomId, body, ready);
    setText('');
    drafts.delete(roomId);
    uploads.forEach((u) => URL.revokeObjectURL(u.previewUrl));
    setUploads([]);
    setTrigger(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected(
          (i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length,
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySuggestion(suggestions[selected]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setTrigger(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      if (editing) store.setEditing(null);
      else if (replyTo) store.setReplyTo(roomId, null);
    } else if (e.key === 'ArrowUp' && !text && !editing) {
      const last = [...(timeline?.messages ?? [])]
        .reverse()
        .find((m) => m.userId === me.id && !m.deletedAt && m.body);
      if (last) {
        e.preventDefault();
        store.setEditing(last.id);
      }
    }
  }

  function onChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    updateTrigger(e.target.value, e.target.selectionStart);
    if (e.target.value.trim()) store.sendTyping(roomId);
  }

  const addFiles = useCallback(
    (files: File[]) => {
      if (disabled) return;
      const images = files.filter(isAcceptedImage);
      if (images.length < files.length) store.showError('UPLOAD_TYPE');
      const room = LIMITS.attachmentsPerMessage - uploads.length;
      if (images.length > room) store.showError('VALIDATION');
      for (const file of images.slice(0, Math.max(0, room))) {
        if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
          store.showError('UPLOAD_TOO_LARGE');
          continue;
        }
        const upload: Upload = {
          localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          previewUrl: URL.createObjectURL(file),
          progress: 0,
          abort: new AbortController(),
        };
        setUploads((list) => [...list, upload]);
        const patch = (p: Partial<Upload>) =>
          setUploads((list) =>
            list.map((u) => (u.localId === upload.localId ? { ...u, ...p } : u)),
          );
        void (async () => {
          try {
            const blob = await prepareImage(file);
            const attachment = await uploadImage(
              blob,
              file.name || 'imagem',
              (progress) => patch({ progress }),
              upload.abort.signal,
            );
            patch({ attachment, progress: 1 });
          } catch (err) {
            if (upload.abort.signal.aborted) return;
            patch({ failed: true });
            store.showError(errorCode(err));
          }
        })();
      }
    },
    [disabled, uploads.length, store],
  );

  useImperativeHandle(ref, () => ({ addFiles }), [addFiles]);

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...e.clipboardData.files];
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function removeUpload(localId: string) {
    setUploads((list) => {
      const u = list.find((x) => x.localId === localId);
      if (u) {
        u.abort.abort();
        URL.revokeObjectURL(u.previewUrl);
      }
      return list.filter((x) => x.localId !== localId);
    });
  }

  const placeholder = archived
    ? t('composer.placeholderArchived')
    : muted
      ? t('composer.placeholderMuted', { time: formatTime(muted.until), topic: muted.topic })
      : t('composer.placeholder', { name: roomName });

  return (
    <div className={styles.composer}>
      {replyTo && !editing && (
        <div className={styles.banner}>
          <span className={styles.bannerText}>
            <strong>{t('message.replyingTo', { name: nameOf(replyTo.userId) })}</strong>{' '}
            {plainText(replyTo.body, nameOf, 80)}
          </span>
          <button
            type="button"
            className={buttons.icon}
            aria-label={t('composer.cancelReply')}
            onClick={() => store.setReplyTo(roomId, null)}
          >
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      )}
      {editing && (
        <div className={styles.banner} data-kind="edit">
          <span className={styles.bannerText}>{t('composer.editing')}</span>
          <button
            type="button"
            className={buttons.icon}
            aria-label={t('composer.cancelEdit')}
            onClick={() => store.setEditing(null)}
          >
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      )}

      {uploads.length > 0 && (
        <ul className={styles.uploads}>
          {uploads.map((u) => (
            <li key={u.localId} className={styles.upload} data-failed={u.failed || undefined}>
              <img src={u.previewUrl} alt="" />
              {!u.attachment && !u.failed && (
                <span
                  className={styles.progress}
                  style={{ transform: `scaleX(${u.progress})` }}
                  aria-label={t('composer.uploading')}
                />
              )}
              {u.failed && <span className={styles.failedLabel}>{t('composer.uploadFailed')}</span>}
              <button
                type="button"
                className={styles.remove}
                aria-label={t('composer.removeAttachment')}
                onClick={() => removeUpload(u.localId)}
              >
                <X size={14} strokeWidth={2} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.box} data-disabled={disabled || undefined}>
        {suggestions.length > 0 && (
          <ul className={styles.suggestions} role="listbox">
            {suggestions.map((s, i) => (
              <li
                key={s.key}
                role="option"
                aria-selected={i === selected}
                className={styles.suggestion}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(s);
                }}
              >
                {!s.member && <span className={styles.suggestionEmoji}>{s.label}</span>}
                <span>{s.member ? s.label : s.detail}</span>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className={buttons.icon}
          aria-label={t('composer.attach')}
          disabled={disabled || !!editing}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus size={18} strokeWidth={1.75} aria-hidden />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          hidden
          onChange={(e) => {
            addFiles([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />

        <textarea
          ref={area}
          className={styles.textarea}
          value={text}
          rows={1}
          placeholder={placeholder}
          aria-label={placeholder}
          disabled={disabled}
          maxLength={LIMITS.messageLength + 200}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onClick={(e) => updateTrigger(e.currentTarget.value, e.currentTarget.selectionStart)}
        />

        <span className={styles.pickerAnchor}>
          <button
            type="button"
            className={buttons.icon}
            aria-label={t('composer.emoji')}
            disabled={disabled}
            onClick={() => setPicker((p) => !p)}
          >
            <Smile size={18} strokeWidth={1.75} aria-hidden />
          </button>
          {picker && (
            <EmojiPicker
              align="left"
              onPick={(emoji) => {
                setPicker(false);
                insertAtCaret(emoji);
              }}
              onClose={() => setPicker(false)}
            />
          )}
        </span>
        <button
          type="button"
          className={`${buttons.icon} ${styles.send}`}
          aria-label={t('composer.send')}
          disabled={editing ? false : !canSend}
          onClick={submit}
        >
          <SendHorizontal size={18} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </div>
  );
});
