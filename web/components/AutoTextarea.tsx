"use client";

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

/** A text box that grows with its text instead of showing a scrollbar (user's request: no small scrollbar
 *  inside the rating note). */
export default function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return <textarea ref={ref} {...props} className={`${props.className ?? ""} resize-none overflow-hidden`} />;
}
