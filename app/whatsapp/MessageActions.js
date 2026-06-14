'use client';
import { useState } from 'react';

// Inline edit/delete controls for a single message (edits/deletes the helpdesk copy).
export default function MessageActions({ id, body, editAction, deleteAction }) {
  const [editing, setEditing] = useState(false);
  return (
    <span className="msg-actions">
      {!editing && (
        <button type="button" className="linkbtn" onClick={() => setEditing(true)}>
          edit
        </button>
      )}
      <form action={deleteAction} style={{ display: 'inline' }}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" className="linkbtn">delete</button>
      </form>
      {editing && (
        <form action={editAction} className="edit-form">
          <input type="hidden" name="id" value={id} />
          <textarea name="body" defaultValue={body} rows={2} />
          <span>
            <button type="submit" className="linkbtn">save</button>
            <button type="button" className="linkbtn" onClick={() => setEditing(false)}>
              cancel
            </button>
          </span>
        </form>
      )}
    </span>
  );
}
