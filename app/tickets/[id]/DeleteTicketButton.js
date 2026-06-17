'use client';

import { deleteTicketAction } from '../../actions';

export default function DeleteTicketButton({ id }) {
  return (
    <form
      action={deleteTicketAction}
      onSubmit={(e) => {
        if (!confirm('Delete this ticket permanently? This cannot be undone.')) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="danger">
        Delete ticket
      </button>
    </form>
  );
}
