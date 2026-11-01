import { useMemo, useState } from 'react';
import { api } from '../api/client';
import type { ClientRow } from '../api/types';
import { Avatar, Empty, ErrorBox, Icon, Spinner } from '../components/ui';
import { useAsync, useDebounced } from '../hooks';
import { fmtDayShort, num, parseDateTime, plural, rub } from '../lib/format';
import { prettyPhone } from '../lib/phone';

type SortKey = 'spent' | 'visits' | 'name' | 'last_visit';
const COLORS = ['#5b5bf7', '#16a394', '#e0569b', '#f08c2b', '#4f7cff', '#8b5cf6'];

export default function ClientsPage() {
  const clients = useAsync(() => api.admin.clients(), []);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('spent');
  const q = useDebounced(query.trim().toLowerCase());

  const rows = useMemo(() => {
    let r = clients.data ?? [];
    if (q) r = r.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q.replace(/\D/g, '') || '¤'));
    const cmp: Record<SortKey, (a: ClientRow, b: ClientRow) => number> = {
      spent: (a, b) => b.spent - a.spent,
      visits: (a, b) => b.visits - a.visits,
      name: (a, b) => a.name.localeCompare(b.name, 'ru'),
      last_visit: (a, b) => (b.last_visit ?? '').localeCompare(a.last_visit ?? ''),
    };
    return [...r].sort(cmp[sort]);
  }, [clients.data, q, sort]);

  const regulars = (clients.data ?? []).filter((c) => c.visits >= 3).length;

  return (
    <div>
      <div className="toolbar wrap">
        <label className="search">
          <Icon name="search" size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Имя или телефон" aria-label="Поиск клиента" />
        </label>
        {clients.data && (
          <span className="muted">
            {num(clients.data.length)} {plural(clients.data.length, 'клиент', 'клиента', 'клиентов')} · {regulars} постоянных
          </span>
        )}
      </div>

      {clients.error ? <ErrorBox error={clients.error} onRetry={clients.reload} /> : !clients.data ? <Spinner /> : (
        <section className="card">
          {rows.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <SortTh label="Клиент" k="name" sort={sort} setSort={setSort} />
                    <th>Телефон</th>
                    <SortTh label="Визиты" k="visits" sort={sort} setSort={setSort} num />
                    <SortTh label="Потратил" k="spent" sort={sort} setSort={setSort} num />
                    <SortTh label="Последний визит" k="last_visit" sort={sort} setSort={setSort} />
                    <th>Следующий</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="client-cell">
                          <Avatar name={c.name} color={COLORS[c.id % COLORS.length]} size={30} />
                          <strong>{c.name}</strong>
                          {c.visits >= 5 && <span className="badge badge-vip">VIP</span>}
                        </span>
                      </td>
                      <td className="nowrap"><a href={`tel:${c.phone}`} className="link">{prettyPhone(c.phone)}</a></td>
                      <td className="num">{c.visits}</td>
                      <td className="num">{rub(c.spent)}</td>
                      <td className="nowrap">{c.last_visit ? fmtDayShort(parseDateTime(c.last_visit)) : <span className="muted">—</span>}</td>
                      <td className="nowrap">{c.next_visit ? <span className="next-visit">{fmtDayShort(parseDateTime(c.next_visit))}</span> : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="Клиенты не найдены" />}
        </section>
      )}
    </div>
  );
}

function SortTh({ label, k, sort, setSort, num: isNum }: { label: string; k: SortKey; sort: SortKey; setSort: (k: SortKey) => void; num?: boolean }) {
  return (
    <th className={isNum ? 'num' : ''} aria-sort={sort === k ? 'descending' : 'none'}>
      <button className={`th-sort ${sort === k ? 'active' : ''}`} onClick={() => setSort(k)}>
        {label}{sort === k && <Icon name="arrowDown" size={12} />}
      </button>
    </th>
  );
}
