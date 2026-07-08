import type { ReactElement } from "react";
import type { ProblemChatMessage } from "@/lib/demo/problem-chat-state";

export function ProblemChatMessageBubble({
  message,
}: {
  message: ProblemChatMessage;
}): ReactElement {
  const isStudent = message.role === "student";
  const bubbleClassName = isStudent
    ? "ml-auto bg-[var(--deep-green)] text-white"
    : message.kind === "error"
      ? "mr-auto bg-[var(--amber-bg)] text-[var(--amber-text)]"
      : "mr-auto bg-white text-[var(--charcoal)]";

  return (
    <div className={`max-w-[88%] rounded-[18px] px-4 py-3 ${bubbleClassName}`}>
      {message.kind === "image_uploaded" ? (
        <div className="mb-3 overflow-hidden rounded-[14px] bg-white/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={message.preview_url}
            alt={message.file_name}
            className="max-h-40 w-full object-contain"
          />
        </div>
      ) : null}
      <p className="whitespace-pre-line break-words text-sm leading-6">
        {message.text}
      </p>
    </div>
  );
}
