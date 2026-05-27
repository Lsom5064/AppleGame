import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { PlayerState, RoomChatMessage } from "../types";
import styles from "./RoomChat.module.css";

interface RoomChatProps {
  player: PlayerState;
  messages: RoomChatMessage[];
  title: string;
  onSendMessage: (text: string) => Promise<void>;
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(timestamp);
}

export function RoomChat({ player, messages, title, onSendMessage }: RoomChatProps) {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!listRef.current) {
      return;
    }

    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextDraft = draft.trim();

    if (!nextDraft || isSending) {
      return;
    }

    try {
      setIsSending(true);
      await onSendMessage(nextDraft);
      setDraft("");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.notice}>{player.nickname}으로 전송</p>
      </div>

      <div ref={listRef} className={styles.messageList}>
        {messages.length === 0 ? (
          <p className={styles.empty}>아직 채팅이 없습니다.</p>
        ) : (
          messages.map((message) => (
            <article key={message.id} className={styles.message}>
              <div className={styles.messageHeader}>
                <strong className={styles.nickname}>
                  {message.nickname}
                  {message.playerId === player.id ? " (나)" : ""}
                </strong>
                <span className={styles.time}>{formatTime(message.createdAt)}</span>
              </div>
              <p className={styles.text}>{message.text}</p>
            </article>
          ))
        )}
      </div>

      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
        <input
          className={styles.input}
          maxLength={200}
          placeholder="메시지를 입력하세요"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className={styles.button} type="submit" disabled={isSending || draft.trim().length === 0}>
          전송
        </button>
      </form>
    </section>
  );
}
