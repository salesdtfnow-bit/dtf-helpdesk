'use client';

// Inserts a saved canned reply into the ticket reply textarea.
export default function CannedPicker({ replies, targetId }) {
  if (!replies || replies.length === 0) return null;
  return (
    <select
      defaultValue=""
      onChange={(e) => {
        const r = replies.find((x) => String(x.id) === e.target.value);
        const ta = document.getElementById(targetId);
        if (r && ta) {
          ta.value = ta.value ? ta.value + '\n\n' + r.body : r.body;
          ta.focus();
        }
        e.target.value = '';
      }}
      style={{ maxWidth: 240 }}
    >
      <option value="">Insert canned reply…</option>
      {replies.map((r) => (
        <option key={r.id} value={r.id}>
          {r.title}
        </option>
      ))}
    </select>
  );
}
