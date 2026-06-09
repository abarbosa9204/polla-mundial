import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider.js';
import {
  fetchPartidos,
  fetchEquipos,
  fetchJugadores,
  fetchPollerEstado,
  type PollerEstado,
  type EquipoView,
  type JugadorView,
} from '../lib/queries.js';
import {
  adminPoll,
  adminRecompute,
  adminCorregirPartido,
  adminResultados,
  adminListarUsuarios,
  adminCrearUsuario,
  adminEstadoUsuario,
  adminEditarUsuario,
  adminEliminarUsuario,
  adminGetSmtp,
  adminSetSmtp,
  adminTestSmtp,
  adminGetPremios,
  adminSetPremios,
  type UsuarioAdmin,
  type SmtpConfigDTO,
  type PremiosConfigDTO,
  ApiError,
} from '../lib/api.js';
import { Header, Cargando } from './CalendarioScreen.js';
import { NOMBRE_FASE, fmtFechaHora, fmtFechaHoraLarga } from '../lib/fases.js';
import { SelectorBuscador, type OpcionSelector } from '../components/SelectorBuscador.js';

export function AdminScreen() {
  const { role, esAdmin, esSuperAdmin } = useAuth();
  const equipos = useQuery({ queryKey: ['equipos'], queryFn: fetchEquipos });
  const partidos = useQuery({ queryKey: ['partidos'], queryFn: fetchPartidos });
  const jugadores = useQuery({ queryKey: ['jugadores'], queryFn: fetchJugadores });
  const poller = useQuery({ queryKey: ['pollerEstado'], queryFn: fetchPollerEstado, refetchInterval: 30_000 });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (role == null) return <Cargando />;
  if (!esAdmin) {
    return (
      <div className="grid place-items-center py-20 text-slate-400 px-6 text-center">
        Sección solo para administradores.
      </div>
    );
  }

  async function run(fn: () => Promise<unknown>, etiqueta: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      setMsg(`${etiqueta}: ✓ ${JSON.stringify(r)}`);
    } catch (err) {
      setMsg(`${etiqueta}: ✗ ${err instanceof ApiError ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Header titulo="Administración" />
      <div className="px-3 space-y-4">
        <section className="card p-4 space-y-2">
          <h2 className="font-semibold">Sincronización</h2>
          <div className="grid grid-cols-2 gap-2">
            <button disabled={busy} onClick={() => run(adminPoll, 'Poller')} className="btn-ghost">
              Ejecutar poller
            </button>
            <button disabled={busy} onClick={() => run(adminRecompute, 'Recalcular')} className="btn-ghost">
              Recalcular todo
            </button>
          </div>
        </section>

        <EstadoApi estado={poller.data} />

        {msg && <p className="text-sm text-center text-slate-300 break-words">{msg}</p>}

        {esSuperAdmin && <GestionUsuarios onDone={(m) => setMsg(m)} />}

        {esSuperAdmin && <ConfigPremios onDone={(m) => setMsg(m)} />}

        {esSuperAdmin && <ConfigCorreo onDone={(m) => setMsg(m)} />}

        <CorreccionManual
          partidos={partidos.data ?? []}
          equipos={equipos.data}
          apiCaida={evaluarApi(poller.data).caida}
          onDone={(m) => setMsg(m)}
        />

        <ResultadosTorneo equipos={equipos.data} jugadores={jugadores.data ?? []} onDone={(m) => setMsg(m)} />
      </div>
    </div>
  );
}

const UMBRAL_FALLOS = 3;

function evaluarApi(e: PollerEstado | null | undefined) {
  if (!e) return { caida: false, minutos: null as number | null, sinDatos: true };
  const minutos = e.ultimo_exito_en ? Math.floor((Date.now() - Date.parse(e.ultimo_exito_en)) / 60000) : null;
  const caida = e.fallos_consecutivos >= UMBRAL_FALLOS || (minutos != null && minutos > 5);
  return { caida, minutos, sinDatos: false };
}

function EstadoApi({ estado }: { estado: PollerEstado | null | undefined }) {
  const ev = evaluarApi(estado);
  const ok = !ev.caida;
  return (
    <section className="card p-4 space-y-1">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Estado de la API</h2>
        <span className={`text-[11px] rounded-full px-2 py-0.5 ${ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
          {ev.sinDatos ? 'sin datos' : ok ? '● funcionando' : '● caída'}
        </span>
      </div>
      {estado && (
        <div className="text-xs text-slate-400 space-y-0.5">
          <p>Fuente activa: {estado.fuente_activa ?? '—'}</p>
          <p>
            Último éxito: {estado.ultimo_exito_en ? fmtFechaHoraLarga(estado.ultimo_exito_en) : 'nunca'}
            {ev.minutos != null && ` (hace ${ev.minutos} min)`}
          </p>
          <p>
            Reintentos fallidos seguidos:{' '}
            <b className={estado.fallos_consecutivos >= UMBRAL_FALLOS ? 'text-red-300' : 'text-slate-300'}>
              {estado.fallos_consecutivos}
            </b>
          </p>
          {estado.mensaje && <p className="text-amber-300 break-words">Último error: {estado.mensaje}</p>}
        </div>
      )}
      <p className={`text-xs mt-1 ${ok ? 'text-slate-500' : 'text-amber-300'}`}>
        {ok
          ? `La API actualiza los resultados sola. Solo carga resultados manualmente si se cae (${UMBRAL_FALLOS}+ reintentos fallidos seguidos).`
          : 'La API lleva varios reintentos fallando: carga los resultados manualmente abajo. Cuando se recupere, usa “Devolver a la API”.'}
      </p>
    </section>
  );
}

function CorreccionManual({
  partidos,
  equipos,
  apiCaida,
  onDone,
}: {
  partidos: import('@polla/data').PartidoRow[];
  equipos: Map<string, { id: string; nombre: string }> | undefined;
  apiCaida: boolean;
  onDone: (m: string) => void;
}) {
  const [id, setId] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [estado, setEstado] = useState('IN_PLAY');
  const [busy, setBusy] = useState(false);
  const p = partidos.find((x) => x.id === id);

  async function submit() {
    if (!id) return;
    setBusy(true);
    try {
      await adminCorregirPartido(id, {
        estado,
        goles_a_90: a === '' ? null : parseInt(a, 10),
        goles_b_90: b === '' ? null : parseInt(b, 10),
      });
      onDone(estado === 'FINISHED' ? 'Resultado final aplicado y recalculado ✓' : 'Resultado parcial aplicado y recalculado ✓');
    } catch (err) {
      onDone(`Error: ${err instanceof ApiError ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function liberar() {
    if (!id) return;
    setBusy(true);
    try {
      await adminCorregirPartido(id, { correccion_manual: false });
      onDone('Control devuelto a la API ✓ (el poller volverá a actualizar este partido)');
    } catch (err) {
      onDone(`Error: ${err instanceof ApiError ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-4 space-y-2">
      <h2 className="font-semibold">Resultado manual (respaldo)</h2>
      <p className="text-xs text-slate-400">
        Úsalo solo si la API está caída. El dato manual prevalece sobre la API y dispara recálculo. Estado{' '}
        <b>IN_PLAY</b> = parcial (en vivo), <b>FINISHED</b> = final.
      </p>
      {!apiCaida && (
        <p className="text-[11px] text-amber-300 bg-amber-500/10 rounded-lg px-2 py-1.5">
          ⚠️ La API está funcionando. No suele hacer falta cargar resultados a mano; al hacerlo, este partido
          dejará de actualizarse solo hasta que pulses “Devolver a la API”.
        </p>
      )}
      <SelectorBuscador
        opciones={partidos.map((x) => ({
          value: x.id,
          label: `${equipos?.get(x.equipo_a ?? '')?.nombre ?? x.equipo_a ?? '?'} vs ${equipos?.get(x.equipo_b ?? '')?.nombre ?? x.equipo_b ?? '?'}`,
          sub: `${NOMBRE_FASE[x.fase]} · ${fmtFechaHora(x.kickoff_utc)}`,
        }))}
        value={id}
        onChange={setId}
        placeholder="Buscar partido…"
        vacioLabel="— Elegir partido —"
      />
      {p && (
        <>
          {p.correccion_manual && (
            <div className="flex items-center justify-between bg-slate-800/60 rounded-lg px-2 py-1.5">
              <span className="text-[11px] text-amber-300">● Bajo control manual (la API no lo actualiza)</span>
              <button disabled={busy} onClick={liberar} className="text-[11px] text-brand underline">Devolver a la API</button>
            </div>
          )}
          <div className="flex items-center gap-2 justify-center">
            <input inputMode="numeric" placeholder="A" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ''))} className="input-score !w-12 !h-12 !text-lg" />
            <span>-</span>
            <input inputMode="numeric" placeholder="B" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, ''))} className="input-score !w-12 !h-12 !text-lg" />
            <select value={estado} onChange={(e) => setEstado(e.target.value)} className="rounded-xl bg-slate-800 px-2 py-2 ring-1 ring-white/10 text-sm">
              {['SCHEDULED', 'IN_PLAY', 'FINISHED'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </>
      )}
      <button disabled={!id || busy} onClick={submit} className="btn-primary w-full">Aplicar resultado manual</button>
    </section>
  );
}

function ResultadosTorneo({
  equipos,
  jugadores,
  onDone,
}: {
  equipos: Map<string, EquipoView> | undefined;
  jugadores: JugadorView[];
  onDone: (m: string) => void;
}) {
  const [campeon, setCampeon] = useState('');
  const [goleadores, setGoleadores] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const opcEquipos: OpcionSelector[] = [...(equipos?.values() ?? [])]
    .sort((x, y) => x.nombre.localeCompare(y.nombre))
    .map((e) => ({ value: e.id, label: e.nombre, badge: e.id, img: e.crest_url }));

  const opcJugadores: OpcionSelector[] = jugadores.map((j) => ({
    value: j.id,
    label: j.nombre,
    sub: j.equipo_id ? equipos?.get(j.equipo_id)?.nombre ?? undefined : undefined,
  }));

  function addGoleador(id: string) {
    if (id && !goleadores.includes(id)) setGoleadores((g) => [...g, id]);
  }

  async function submit() {
    setBusy(true);
    try {
      await adminResultados({ campeon: campeon || null, goleadores });
      onDone('Resultados del torneo guardados y recalculado ✓');
    } catch (err) {
      onDone(`Error: ${err instanceof ApiError ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-4 space-y-2">
      <h2 className="font-semibold">Resultados de torneo (bonos)</h2>

      <label className="text-xs text-slate-400">Campeón</label>
      <SelectorBuscador
        opciones={opcEquipos}
        value={campeon}
        onChange={setCampeon}
        placeholder="Buscar selección…"
        vacioLabel="— Sin definir —"
      />

      <label className="text-xs text-slate-400">Goleador(es) del Mundial (varios = empate)</label>
      <SelectorBuscador
        opciones={opcJugadores}
        value=""
        onChange={addGoleador}
        placeholder="Buscar y agregar jugador…"
        vacioLabel="— Agregar goleador —"
      />
      {goleadores.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {goleadores.map((id) => {
            const j = jugadores.find((x) => x.id === id);
            return (
              <span key={id} className="flex items-center gap-1 bg-brand/20 text-brand rounded-lg px-2 py-1 text-xs">
                {j?.nombre ?? id}
                <button onClick={() => setGoleadores((g) => g.filter((x) => x !== id))} className="text-brand/70 hover:text-white">✕</button>
              </span>
            );
          })}
        </div>
      )}

      <button disabled={busy} onClick={submit} className="btn-primary w-full">Guardar resultados</button>
    </section>
  );
}

const BADGE: Record<string, string> = {
  pendiente: 'bg-amber-500/20 text-amber-300',
  aprobado: 'bg-emerald-500/20 text-emerald-300',
  rechazado: 'bg-red-500/20 text-red-300',
};
const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'pendiente',
  aprobado: 'activo',
  rechazado: 'inactivo',
};

function GestionUsuarios({ onDone }: { onDone: (m: string) => void }) {
  const qc = useQueryClient();
  const usuarios = useQuery({
    queryKey: ['admin-usuarios'],
    queryFn: () => adminListarUsuarios().then((r) => r.usuarios),
  });
  const [busy, setBusy] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [nuevoEmail, setNuevoEmail] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');

  const refrescar = () => qc.invalidateQueries({ queryKey: ['admin-usuarios'] });

  async function accion(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      onDone(ok);
      await refrescar();
    } catch (err) {
      onDone(`Error: ${err instanceof ApiError ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function crear() {
    if (!nuevoEmail || !nuevoNombre) return;
    await accion(
      () => adminCrearUsuario({ email: nuevoEmail.trim(), display_name: nuevoNombre.trim() }),
      'Invitación enviada (revisa que el correo llegue) ✓',
    );
    setNuevoEmail('');
    setNuevoNombre('');
  }

  const lista = usuarios.data ?? [];
  const pendientes = lista.filter((u) => u.estado === 'pendiente').length;

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Gestión de usuarios</h2>
        {pendientes > 0 && (
          <span className="text-xs rounded-full bg-amber-500/20 text-amber-300 px-2 py-0.5">
            {pendientes} por aprobar
          </span>
        )}
      </div>

      {/* Crear usuario por invitación */}
      <div className="rounded-xl bg-slate-800/60 p-3 space-y-2">
        <p className="text-xs text-slate-400">Crear usuario (le llega un correo para fijar su contraseña; queda aprobado).</p>
        <input
          type="email"
          placeholder="correo@ejemplo.com"
          value={nuevoEmail}
          onChange={(e) => setNuevoEmail(e.target.value)}
          className="w-full rounded-lg bg-slate-800 px-3 py-2 ring-1 ring-white/10 text-sm"
        />
        <input
          placeholder="Nombre para la tabla"
          value={nuevoNombre}
          onChange={(e) => setNuevoNombre(e.target.value)}
          className="w-full rounded-lg bg-slate-800 px-3 py-2 ring-1 ring-white/10 text-sm"
        />
        <button disabled={busy || !nuevoEmail || !nuevoNombre} onClick={crear} className="btn-primary w-full text-sm">
          Invitar usuario
        </button>
      </div>

      {usuarios.isLoading && <p className="text-sm text-slate-400">Cargando usuarios…</p>}
      {usuarios.isError && <p className="text-sm text-red-400">No se pudo cargar la lista.</p>}

      <ul className="space-y-2">
        {lista.map((u) => (
          <li key={u.id} className="rounded-xl bg-slate-800/60 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{u.display_name}</p>
                <p className="text-xs text-slate-400 truncate">{u.email}</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <span className={`text-[10px] rounded-full px-2 py-0.5 ${BADGE[u.estado]}`}>{ESTADO_LABEL[u.estado] ?? u.estado}</span>
                  {u.role !== 'user' && (
                    <span className="text-[10px] rounded-full px-2 py-0.5 bg-brand/20 text-brand">{u.role}</span>
                  )}
                  {!u.email_confirmado && (
                    <span className="text-[10px] rounded-full px-2 py-0.5 bg-slate-600/40 text-slate-300">sin confirmar</span>
                  )}
                  <span className={`text-[10px] rounded-full px-2 py-0.5 ${u.pagado ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-600/40 text-slate-300'}`}>
                    {u.pagado ? '✓ pagado' : 'sin pago'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {u.estado !== 'aprobado' && (
                <button disabled={busy} onClick={() => accion(() => adminEstadoUsuario(u.id, 'aprobado'), 'Usuario activado ✓')} className="btn-ghost text-xs px-2 py-1 text-emerald-300">
                  Activar
                </button>
              )}
              {u.estado !== 'rechazado' && u.role !== 'super_admin' && (
                <button disabled={busy} onClick={() => accion(() => adminEstadoUsuario(u.id, 'rechazado'), 'Usuario inactivado')} className="btn-ghost text-xs px-2 py-1 text-amber-300">
                  Inactivar
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => accion(() => adminEditarUsuario(u.id, { pagado: !u.pagado }), u.pagado ? 'Pago retirado' : 'Pago confirmado ✓')}
                className={`btn-ghost text-xs px-2 py-1 ${u.pagado ? 'text-slate-300' : 'text-emerald-300'}`}
              >
                {u.pagado ? 'Quitar pago' : 'Marcar pagado'}
              </button>
              <button disabled={busy} onClick={() => setEditando(editando === u.id ? null : u.id)} className="btn-ghost text-xs px-2 py-1">
                Editar
              </button>
              {u.role !== 'super_admin' && (
                <button
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`¿Eliminar a ${u.display_name}? Se borran sus pronósticos y puntos.`))
                      accion(() => adminEliminarUsuario(u.id), 'Usuario eliminado');
                  }}
                  className="btn-ghost text-xs px-2 py-1 text-red-400"
                >
                  Eliminar
                </button>
              )}
            </div>

            {editando === u.id && (
              <EditarUsuario
                usuario={u}
                busy={busy}
                onGuardar={(cambios) => accion(() => adminEditarUsuario(u.id, cambios), 'Usuario actualizado ✓').then(() => setEditando(null))}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EditarUsuario({
  usuario,
  busy,
  onGuardar,
}: {
  usuario: UsuarioAdmin;
  busy: boolean;
  onGuardar: (cambios: { email?: string; display_name?: string; password?: string }) => void;
}) {
  const [email, setEmail] = useState(usuario.email ?? '');
  const [nombre, setNombre] = useState(usuario.display_name);
  const [password, setPassword] = useState('');

  function submit() {
    const cambios: { email?: string; display_name?: string; password?: string } = {};
    if (email && email !== usuario.email) cambios.email = email.trim();
    if (nombre && nombre !== usuario.display_name) cambios.display_name = nombre.trim();
    if (password) cambios.password = password;
    if (!cambios.email && !cambios.display_name && !cambios.password) return;
    onGuardar(cambios);
  }

  return (
    <div className="rounded-lg bg-slate-900/60 p-3 space-y-2 mt-1">
      <label className="text-[11px] text-slate-400">Correo (no afecta sus puntos; todo va por ID)</label>
      <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg bg-slate-800 px-3 py-2 ring-1 ring-white/10 text-sm" />
      <label className="text-[11px] text-slate-400">Nombre</label>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full rounded-lg bg-slate-800 px-3 py-2 ring-1 ring-white/10 text-sm" />
      <label className="text-[11px] text-slate-400">Nueva contraseña (dejar vacío para no cambiar)</label>
      <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" className="w-full rounded-lg bg-slate-800 px-3 py-2 ring-1 ring-white/10 text-sm" />
      <button disabled={busy} onClick={submit} className="btn-primary w-full text-sm">Guardar cambios</button>
    </div>
  );
}

function ConfigPremios({ onDone }: { onDone: (m: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-premios'], queryFn: adminGetPremios });
  const [form, setForm] = useState<PremiosConfigDTO | null>(null);
  const [cargado, setCargado] = useState(false);
  const [busy, setBusy] = useState(false);

  if (q.data && !cargado) {
    setForm(q.data.config);
    setCargado(true);
  }
  if (!form) return null;
  const aportantes = q.data?.bolsa.aportantes ?? 0;
  // Previsualización en vivo: bolsa = inscripción × usuarios activos y pagados.
  const bolsa = Number(form.valor_inscripcion ?? 0) * aportantes;

  const set = (k: keyof PremiosConfigDTO, v: unknown) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s.replace(/[^\d.]/g, '')));
  const premio = (pct: number, monto: number | null) =>
    monto != null ? monto : Math.round((bolsa * pct) / 100);
  const money = (n: number) => `${n.toLocaleString('es-CO')} ${form.moneda}`;

  async function guardar() {
    if (!form) return;
    setBusy(true);
    try {
      await adminSetPremios(form);
      await qc.invalidateQueries({ queryKey: ['admin-premios'] });
      await qc.invalidateQueries({ queryKey: ['bolsa'] });
      onDone('Premios guardados ✓');
    } catch (err) {
      onDone(`Error: ${err instanceof ApiError ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const inp = 'w-full rounded-lg bg-slate-800 px-3 py-2 ring-1 ring-white/10 text-sm';
  const puestos: Array<[string, keyof PremiosConfigDTO, keyof PremiosConfigDTO]> = [
    ['1º lugar', 'pct_primero', 'monto_primero'],
    ['2º lugar', 'pct_segundo', 'monto_segundo'],
    ['3º lugar', 'pct_tercero', 'monto_tercero'],
  ];

  return (
    <section className="card p-4 space-y-2">
      <h2 className="font-semibold">Bolsa y premios</h2>
      <div className="rounded-xl bg-brand/10 ring-1 ring-brand/30 p-3 text-center">
        <p className="text-xs text-slate-300">Bolsa actual</p>
        <p className="text-2xl font-bold text-brand">{money(bolsa)}</p>
        <p className="text-[11px] text-slate-400">
          {money(Number(form.valor_inscripcion ?? 0))} × {aportantes} usuarios activos y pagados
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-slate-400">Valor de inscripción</label>
          <input inputMode="numeric" value={String(form.valor_inscripcion ?? '')} onChange={(e) => set('valor_inscripcion', Number(e.target.value.replace(/[^\d.]/g, '')) || 0)} className={inp} />
        </div>
        <div>
          <label className="text-[11px] text-slate-400">Moneda</label>
          <input value={form.moneda} onChange={(e) => set('moneda', e.target.value)} className={inp} />
        </div>
      </div>

      <p className="text-xs text-slate-400 pt-1">
        Define el reparto por % (el sistema calcula el monto) o fija un monto exacto que prevalece sobre el %.
        El total crece a medida que marcas pagos; lo de “por pagado” es lo que aporta cada inscripción.
      </p>
      {aportantes === 0 && Number(form.valor_inscripcion ?? 0) > 0 && (
        <p className="text-[11px] text-amber-300 bg-amber-500/10 rounded-lg px-2 py-1.5">
          Aún no hay usuarios con pago confirmado, por eso el total es 0. Marca pagos en “Gestión de usuarios”.
        </p>
      )}
      {puestos.map(([label, pctKey, montoKey]) => {
        const pct = Number(form[pctKey] ?? 0);
        const monto = form[montoKey] as number | null;
        const porPagado = monto != null ? null : Math.round((Number(form.valor_inscripcion ?? 0) * pct) / 100);
        return (
          <div key={label} className="rounded-lg bg-slate-800/60 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{label}</span>
              <span className="text-right">
                <span className="text-sm font-bold text-brand">{money(premio(pct, monto))}</span>
                {porPagado != null && (
                  <span className="block text-[10px] text-slate-400">{money(porPagado)} por pagado</span>
                )}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400">%</label>
                <input inputMode="numeric" value={String(form[pctKey] ?? '')} onChange={(e) => set(pctKey, Number(e.target.value.replace(/[^\d.]/g, '')) || 0)} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Monto fijo (opcional)</label>
                <input inputMode="numeric" value={monto == null ? '' : String(monto)} onChange={(e) => set(montoKey, numOrNull(e.target.value))} placeholder="usa %" className={inp} />
              </div>
            </div>
          </div>
        );
      })}

      <button disabled={busy} onClick={guardar} className="btn-primary w-full text-sm">Guardar premios</button>
    </section>
  );
}

function ConfigCorreo({ onDone }: { onDone: (m: string) => void }) {
  const cfgQ = useQuery({ queryKey: ['admin-smtp'], queryFn: () => adminGetSmtp().then((r) => r.config) });
  const [form, setForm] = useState<Partial<SmtpConfigDTO>>({});
  const [password, setPassword] = useState('');
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [cargado, setCargado] = useState(false);

  // Cargar el form una vez con lo que venga del servidor.
  if (cfgQ.data && !cargado) {
    setForm(cfgQ.data);
    setCargado(true);
  }
  const set = (k: keyof SmtpConfigDTO, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function guardar() {
    setBusy(true);
    try {
      await adminSetSmtp({
        host: form.host ?? 'smtp.gmail.com',
        port: Number(form.port ?? 465),
        secure: form.secure ?? true,
        username: form.username ?? '',
        password: password || undefined,
        sender_email: form.sender_email ?? '',
        sender_name: form.sender_name ?? 'Polla Mundialista',
        habilitado: form.habilitado ?? false,
      });
      setPassword('');
      onDone('Configuración de correo guardada ✓');
    } catch (err) {
      onDone(`Error: ${err instanceof ApiError ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function probar() {
    if (!testTo) return;
    setBusy(true);
    try {
      await adminTestSmtp(testTo.trim());
      onDone(`Correo de prueba enviado a ${testTo} ✓`);
    } catch (err) {
      onDone(`Error enviando prueba: ${err instanceof ApiError ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const inp = 'w-full rounded-lg bg-slate-800 px-3 py-2 ring-1 ring-white/10 text-sm';

  return (
    <section className="card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Correo (SMTP)</h2>
        <span className={`text-[10px] rounded-full px-2 py-0.5 ${form.habilitado ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-600/40 text-slate-300'}`}>
          {form.habilitado ? 'habilitado' : 'deshabilitado'}
        </span>
      </div>
      <p className="text-xs text-slate-400">Se usa para confirmación de registro, invitaciones y reset de contraseña.</p>

      <label className="text-[11px] text-slate-400">Servidor</label>
      <input value={form.host ?? ''} onChange={(e) => set('host', e.target.value)} placeholder="smtp.gmail.com" className={inp} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-slate-400">Puerto</label>
          <input inputMode="numeric" value={form.port ?? 465} onChange={(e) => set('port', Number(e.target.value.replace(/\D/g, '')) || 0)} className={inp} />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={form.secure ?? true} onChange={(e) => set('secure', e.target.checked)} />
          SSL (465)
        </label>
      </div>
      <label className="text-[11px] text-slate-400">Usuario (correo de la cuenta)</label>
      <input value={form.username ?? ''} onChange={(e) => set('username', e.target.value)} placeholder="cuenta@gmail.com" className={inp} />
      <label className="text-[11px] text-slate-400">
        Contraseña de aplicación {cfgQ.data?.password_set && <span className="text-emerald-400">(ya hay una guardada — deja vacío para conservarla)</span>}
      </label>
      <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="app password de Gmail" className={inp} />
      <label className="text-[11px] text-slate-400">Remitente — correo</label>
      <input value={form.sender_email ?? ''} onChange={(e) => set('sender_email', e.target.value)} placeholder="cuenta@gmail.com" className={inp} />
      <label className="text-[11px] text-slate-400">Remitente — nombre</label>
      <input value={form.sender_name ?? ''} onChange={(e) => set('sender_name', e.target.value)} placeholder="Polla Mundialista" className={inp} />
      <label className="flex items-center gap-2 text-sm py-1">
        <input type="checkbox" checked={form.habilitado ?? false} onChange={(e) => set('habilitado', e.target.checked)} />
        Habilitar envío de correos
      </label>
      <button disabled={busy} onClick={guardar} className="btn-primary w-full text-sm">Guardar configuración</button>

      <div className="rounded-xl bg-slate-800/60 p-3 space-y-2 mt-2">
        <label className="text-[11px] text-slate-400">Enviar correo de prueba a:</label>
        <input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="tucorreo@ejemplo.com" className={inp} />
        <button disabled={busy || !testTo} onClick={probar} className="btn-ghost w-full text-sm">Enviar prueba</button>
      </div>
    </section>
  );
}
