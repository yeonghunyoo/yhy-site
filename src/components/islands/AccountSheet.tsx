import { useEffect, useState, type SubmitEvent } from 'react';
import type { Dict, Locale } from '../../i18n';
import { setFlashToast } from './events';
import { Sheet } from './Sheet';

interface Props {
  dict: Dict;
  locale: Locale;
  open: boolean;
  onClose: () => void;
}

export function AccountSheet({ dict, locale, open, onClose }: Props) {
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setConfirm('');
      setError(null);
    }
  }, [open]);

  const matches = confirm.trim().toLowerCase() === dict.account.confirmWord;

  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!matches) return;
    setBusy(true);
    const res = await fetch('/api/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: confirm.trim() }),
    }).catch(() => null);
    if (res?.ok) {
      setFlashToast('deleted');
      location.href = `/${locale}/`;
      return;
    }
    setBusy(false);
    setError(dict.ui.error);
  }

  return (
    <Sheet open={open} onClose={onClose} title={dict.account.title} closeLabel={dict.ui.close}>
      <form onSubmit={submit}>
        <p className="text-muted">{dict.account.desc}</p>
        {error && (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <label className="mt-5 block text-sm font-semibold" htmlFor="delete-confirm">
          {dict.account.confirmLabel}
        </label>
        <input
          id="delete-confirm"
          data-autofocus
          className="field mt-2"
          autoComplete="off"
          autoCapitalize="none"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <div className="mt-5 flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>
            {dict.ui.cancel}
          </button>
          <button type="submit" className="btn flex-1 bg-danger text-white" disabled={!matches || busy}>
            {dict.account.submit}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
