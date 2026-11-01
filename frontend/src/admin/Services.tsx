import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { Service, ServiceInput } from '../api/types';
import { ErrorBox, Icon, Modal, Spinner, useToast } from '../components/ui';
import { useAsync } from '../hooks';
import { duration, rub } from '../lib/format';

const EMPTY: ServiceInput = { name: '', category: 'Барбершоп', duration: 60, price: 2000, active: true };

export default function ServicesPage() {
  const services = useAsync(() => api.admin.services(), []);
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Service | null>(null);
  const toast = useToast();

  const categories = [...new Set((services.data ?? []).map((s) => s.category))];

  async function remove(s: Service) {
    try {
      await api.admin.deleteService(s.id);
      toast('Услуга удалена');
      services.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ошибка', 'error');
    } finally {
      setConfirmDelete(null);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <span className="muted">Цены и длительность влияют на онлайн-запись сразу после сохранения.</span>
        <button className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} />Новая услуга</button>
      </div>

      {services.error ? <ErrorBox error={services.error} onRetry={services.reload} /> : !services.data ? <Spinner /> : (
        <section className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Услуга</th><th>Категория</th><th>Длительность</th><th className="num">Цена</th><th /></tr>
              </thead>
              <tbody>
                {services.data.map((s) => (
                  <tr key={s.id} className={s.active ? '' : 'archived'}>
                    <td><strong>{s.name}</strong>{!s.active && <span className="badge badge-cancelled">в архиве</span>}</td>
                    <td>{s.category}</td>
                    <td>{duration(s.duration)}</td>
                    <td className="num">{rub(s.price)}</td>
                    <td className="row-actions">
                      <button className="icon-btn" onClick={() => setEditing(s)} aria-label={`Изменить ${s.name}`}><Icon name="edit" size={16} /></button>
                      {s.active && <button className="icon-btn danger" onClick={() => setConfirmDelete(s)} aria-label={`Удалить ${s.name}`}><Icon name="trash" size={16} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {editing && (
        <ServiceForm
          service={editing === 'new' ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            services.reload();
          }}
        />
      )}

      {confirmDelete && (
        <Modal title="Удалить услугу?" onClose={() => setConfirmDelete(null)}>
          <p className="muted">«{confirmDelete.name}» исчезнет из онлайн-записи. Если по услуге уже были записи, она уйдёт в архив, и история сохранится.</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Отмена</button>
            <button className="btn btn-danger" onClick={() => remove(confirmDelete)}>Удалить</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ServiceForm({ service, categories, onClose, onSaved }: {
  service: Service | null;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ServiceInput>(service ? { ...service } : EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const set = <K extends keyof ServiceInput>(k: K, v: ServiceInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.name.trim().length < 2) return setError('Введите название');
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, name: form.name.trim(), category: form.category.trim() };
      if (service) await api.admin.updateService(service.id, body);
      else await api.admin.createService(body);
      toast(service ? 'Изменения сохранены' : 'Услуга добавлена');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={service ? 'Изменить услугу' : 'Новая услуга'} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="field full">
          <span>Название</span>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus required />
        </label>
        <label className="field full">
          <span>Категория</span>
          <input value={form.category} onChange={(e) => set('category', e.target.value)} list="categories" required />
          <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label className="field">
          <span>Длительность, мин</span>
          <input type="number" min={5} max={600} step={5} value={form.duration} onChange={(e) => set('duration', Number(e.target.value))} required />
        </label>
        <label className="field">
          <span>Цена, ₽</span>
          <input type="number" min={0} step={50} value={form.price} onChange={(e) => set('price', Number(e.target.value))} required />
        </label>
        {service && (
          <label className="check full">
            <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
            Доступна для онлайн-записи
          </label>
        )}
        {error && <div className="notice notice-error full" role="alert">{error}</div>}
        <div className="modal-actions full">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
        </div>
      </form>
    </Modal>
  );
}
