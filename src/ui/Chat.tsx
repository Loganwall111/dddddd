import { useEffect, useRef, useState } from 'react';

/** Bottom-of-screen command bar. Enter runs the command, Escape closes it. */
export function Chat({ initial, onSubmit, onClose }: { initial: string; onSubmit: (text: string) => string; onClose: () => void }) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = input.current; if (!el) return;
    el.focus(); el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) { onClose(); return; }
    try { onSubmit(trimmed); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  return <form className="chat-bar" onSubmit={submit} role="dialog" aria-label="Command">
    <input ref={input} value={text} onChange={e => { setText(e.target.value); setError(''); }}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}
      placeholder="Type a command, e.g. /give tnt 16" aria-label="Command input" autoComplete="off" spellCheck={false}/>
    {error && <div className="chat-error" role="alert">{error}</div>}
  </form>;
}
