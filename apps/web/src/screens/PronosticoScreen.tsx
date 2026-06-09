import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { esEliminatoria, calcularPuntos, MARGEN_CIERRE_MS } from '@polla/core';
import type { ConfigPuntos, Fase, DesglosePartido } from '@polla/core';
import { describirDesglose } from '../lib/desglose.js';
import { fetchPartidos, fetchEquipos, fetchMisPronosticos, fetchConfigPuntos, fetchMisDesgloses } from '../lib/queries.js';
import { guardarPronostico, ApiError } from '../lib/api.js';
import { encolar } from '../lib/colaPronosticos.js';
import { TeamBadge } from '../components/TeamBadge.js';
import { Header, Cargando, RelojColombia } from './CalendarioScreen.js';
import { NOMBRE_FASE, MULTIPLICADOR_FASE, fmtFechaHora, fmtFechaHoraLarga } from '../lib/fases.js';
import { useCountdown, useOnline } from '../lib/hooks.js';

export function PronosticoScreen() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const online = useOnline();

  const equipos = useQuery({ queryKey: ['equipos'], queryFn: fetchEquipos });
  const partidos = useQuery({ queryKey: ['partidos'], queryFn: fetchPartidos });
  const mios = useQuery({ queryKey: ['misPronosticos'], queryFn: fetchMisPronosticos });
  const config = useQuery({ queryKey: ['configPuntos'], queryFn: fetchConfigPuntos });
  const desgloses = useQuery({ queryKey: ['misDesgloses'], queryFn: fetchMisDesgloses });

  const partido = partidos.data?.find((p) => p.id === id);
  const mio = mios.data?.find((p) => p.partido_id === id);
  const miDesglose = desgloses.data?.find((d) => d.partido_id === id);

  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [habraExtra, setHabraExtra] = useState<boolean | null>(null);
  const [ea, setEa] = useState('');
  const [eb, setEb] = useState('');
  const [ganador, setGanador] = useState<'A' | 'B' | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  // Precargar mi pronóstico existente.
  useEffect(() => {
    if (mio) {
      setA(String(mio.marcador_a_90));
      setB(String(mio.marcador_b_90));
      setHabraExtra(mio.habra_extra);
      setEa(mio.extra_a != null ? String(mio.extra_a) : '');
      setEb(mio.extra_b != null ? String(mio.extra_b) : '');
      setGanador(mio.ganador_final);
    }
  }, [mio]);

  const { cerrado, etiqueta } = useCountdown(partido?.kickoff_utc ?? null, MARGEN_CIERRE_MS);

  if (partidos.isLoading || !partido) return <Cargando />;

  const elim = esEliminatoria(partido.fase);
  // Cerrado si pasó el margen de 5 min O si el API ya reporta el partido iniciado.
  const apiIniciado = ['IN_PLAY', 'PAUSED', 'FINISHED', 'SUSPENDED'].includes(partido.estado);
  const cerradoEdicion = cerrado || apiIniciado;

  async function onSubmit() {
    if (!id) return;
    setMsg(null);
    const golesA = parseInt(a, 10);
    const golesB = parseInt(b, 10);
    if (Number.isNaN(golesA) || Number.isNaN(golesB)) {
      setMsg({ tipo: 'err', texto: 'Ingresa el marcador de ambos equipos.' });
      return;
    }
    const payload = {
      marcador90: { golesA, golesB },
      ...(elim
        ? {
            habraExtra,
            marcadorExtra:
              habraExtra && ea !== '' && eb !== ''
                ? { golesA: parseInt(ea, 10), golesB: parseInt(eb, 10) }
                : null,
            ganadorFinal: ganador,
          }
        : {}),
    };

    // Sin conexión: se guarda en la cola local con su hora y se sincroniza luego.
    if (!navigator.onLine) {
      encolar(id, payload);
      setMsg({ tipo: 'ok', texto: 'Guardado sin conexión ✓ Se registrará solo cuando vuelva internet.' });
      return;
    }

    setGuardando(true);
    try {
      const r = await guardarPronostico(id, payload);
      setMsg({ tipo: 'ok', texto: `Guardado ✓ (registrado ${fmtFechaHoraLarga(r.registradoEn)})` });
      mios.refetch();
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'OFFLINE' || err.code === 'NETWORK')) {
        encolar(id, payload);
        setMsg({ tipo: 'ok', texto: 'Sin conexión: guardado localmente, se sincronizará automáticamente.' });
      } else {
        const texto =
          err instanceof ApiError
            ? err.code === 'LOCKED'
              ? 'El partido ya cerró: no se puede guardar.'
              : err.message
            : 'No se pudo guardar.';
        setMsg({ tipo: 'err', texto });
      }
    } finally {
      setGuardando(false);
    }
  }

  const bloqueado = cerradoEdicion;

  return (
    <div>
      <Header titulo="Mi pronóstico" accion={<div className="flex items-center gap-3"><RelojColombia /><button onClick={() => nav(-1)} className="text-slate-400 text-sm">Volver</button></div>} />
      <div className="px-4 space-y-4">
        <div className="card p-4">
          <div className="text-[11px] text-slate-400 flex justify-between">
            <span>
              {NOMBRE_FASE[partido.fase]}
              {MULTIPLICADOR_FASE[partido.fase] > 1 && (
                <span className="ml-1 text-brand">×{MULTIPLICADOR_FASE[partido.fase]}</span>
              )}
            </span>
            <span>{fmtFechaHora(partido.kickoff_utc)}</span>
          </div>

          <div className="mt-3 flex items-center justify-center gap-4">
            <div className="flex-1 text-right"><TeamBadge equipo={partido.equipo_a ? equipos.data?.get(partido.equipo_a) : undefined} /></div>
            <div className="flex items-center gap-2">
              <input inputMode="numeric" className="input-score" value={a} disabled={bloqueado}
                onChange={(e) => setA(e.target.value.replace(/\D/g, '').slice(0, 2))} />
              <span className="text-slate-500">-</span>
              <input inputMode="numeric" className="input-score" value={b} disabled={bloqueado}
                onChange={(e) => setB(e.target.value.replace(/\D/g, '').slice(0, 2))} />
            </div>
            <div className="flex-1"><TeamBadge equipo={partido.equipo_b ? equipos.data?.get(partido.equipo_b) : undefined} /></div>
          </div>

          <div className="mt-3 text-center">
            {apiIniciado ? (
              <span className="text-red-400 text-sm font-semibold">🔒 El partido ya inició — pronóstico cerrado</span>
            ) : cerrado ? (
              <span className="text-red-400 text-sm font-semibold">🔒 Cerrado — faltan menos de 5 min para el inicio</span>
            ) : (
              <span className="text-sm text-slate-400">
                Cierra en <b className="text-brand tabular-nums">{etiqueta}</b>
                <span className="block text-[10px] text-slate-500">(5 min antes del inicio)</span>
              </span>
            )}
          </div>
        </div>

        <ResumenPronostico mio={mio} partido={partido} desglose={miDesglose} cerrado={cerradoEdicion} etiqueta={etiqueta} />

        {elim && (
          <div className="card p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-200">Eliminatoria (opcional)</p>
            <div className="flex gap-2">
              <Toggle label="¿Habrá tiempo extra?" value={habraExtra} onChange={setHabraExtra} disabled={bloqueado} />
            </div>
            {habraExtra === true && (
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs text-slate-400">Marcador al final del extra:</span>
                <input inputMode="numeric" className="input-score !w-12 !h-12 !text-lg" value={ea} disabled={bloqueado}
                  onChange={(e) => setEa(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                <span>-</span>
                <input inputMode="numeric" className="input-score !w-12 !h-12 !text-lg" value={eb} disabled={bloqueado}
                  onChange={(e) => setEb(e.target.value.replace(/\D/g, '').slice(0, 2))} />
              </div>
            )}
            <div>
              <p className="text-xs text-slate-400 mb-1">Ganador final (incluye penales):</p>
              <div className="grid grid-cols-2 gap-2">
                <button disabled={bloqueado} onClick={() => setGanador('A')}
                  className={`btn ${ganador === 'A' ? 'bg-brand text-white' : 'bg-white/5'}`}>
                  {equipos.data?.get(partido.equipo_a ?? '')?.nombre ?? 'Local'}
                </button>
                <button disabled={bloqueado} onClick={() => setGanador('B')}
                  className={`btn ${ganador === 'B' ? 'bg-brand text-white' : 'bg-white/5'}`}>
                  {equipos.data?.get(partido.equipo_b ?? '')?.nombre ?? 'Visita'}
                </button>
              </div>
            </div>
          </div>
        )}

        {config.data && (
          <PuntosPosibles
            config={config.data}
            fase={partido.fase}
            elim={elim}
            a={a}
            b={b}
            habraExtra={habraExtra}
            ea={ea}
            eb={eb}
            ganador={ganador}
          />
        )}

        {msg && (
          <p className={`text-sm text-center ${msg.tipo === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
            {msg.texto}
          </p>
        )}

        {!online && !cerradoEdicion && (
          <p className="text-amber-400 text-sm text-center">Sin conexión: tu marcador se guardará y se sincronizará al volver internet.</p>
        )}

        <button onClick={onSubmit} disabled={bloqueado || guardando} className="btn-primary w-full">
          {guardando
            ? 'Guardando…'
            : cerradoEdicion
              ? 'Pronóstico cerrado'
              : !online
                ? mio ? 'Actualizar sin conexión' : 'Guardar sin conexión'
                : mio ? 'Actualizar pronóstico' : 'Guardar pronóstico'}
        </button>
      </div>
    </div>
  );
}

function ResumenPronostico({
  mio,
  partido,
  desglose,
  cerrado,
  etiqueta,
}: {
  mio: import('@polla/data').PronosticoRow | undefined;
  partido: import('@polla/data').PartidoRow;
  desglose: import('@polla/data').DesgloseRow | undefined;
  cerrado: boolean;
  etiqueta: string;
}) {
  const finalizado = partido.estado === 'FINISHED';
  const enVivo = partido.estado === 'IN_PLAY' || partido.estado === 'PAUSED';
  const conResultado = (finalizado || enVivo) && partido.goles_a_90 != null && partido.goles_b_90 != null;
  const d = desglose?.desglose as DesglosePartido | undefined;

  return (
    <div className="card p-4 space-y-2">
      {/* Editable / cerrado */}
      <div className={`text-sm font-semibold ${cerrado ? 'text-red-400' : 'text-emerald-400'}`}>
        {cerrado
          ? '🔒 Cerrado — ya no se puede editar'
          : `✏️ Editable · cierra en ${etiqueta} (5 min antes del inicio)`}
      </div>

      {/* Tu pronóstico */}
      {mio ? (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-300">Tu pronóstico</span>
          <span className="text-lg font-bold tabular-nums">{mio.marcador_a_90} - {mio.marcador_b_90}</span>
        </div>
      ) : (
        <p className="text-sm text-amber-300">
          Aún no has pronosticado. Si no registras tu marcador antes del cierre, sumas <b>0 puntos</b> en este partido.
        </p>
      )}
      {mio && (
        <p className="text-[11px] text-slate-500">
          Registrado: {fmtFechaHoraLarga(mio.updated_at_server ?? mio.created_at_server)} (v{mio.version})
        </p>
      )}

      {/* Resultado + si atinó + puntos */}
      {conResultado && (
        <div className="border-t border-white/5 pt-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">{finalizado ? 'Resultado final' : 'Marcador (en vivo)'}</span>
            <span className="text-lg font-bold tabular-nums">{partido.goles_a_90} - {partido.goles_b_90}</span>
          </div>
          {mio && desglose && d && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">{describirDesglose(d)}</span>
              <span className={`text-sm font-bold tabular-nums shrink-0 ${desglose.puntos > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                {desglose.provisional ? 'En juego' : 'Ganaste'} {desglose.puntos} pts
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PuntosPosibles({
  config,
  fase,
  elim,
  a,
  b,
  habraExtra,
  ea,
  eb,
  ganador,
}: {
  config: ConfigPuntos;
  fase: Fase;
  elim: boolean;
  a: string;
  b: string;
  habraExtra: boolean | null;
  ea: string;
  eb: string;
  ganador: 'A' | 'B' | null;
}) {
  const mult = config.multiplicadores[fase];
  const golesA = parseInt(a, 10);
  const golesB = parseInt(b, 10);
  const tieneMarcador = !Number.isNaN(golesA) && !Number.isNaN(golesB);

  // Máximo real con ESTE pronóstico = puntuarlo como si el resultado fuera idéntico.
  let maximo = 0;
  if (tieneMarcador) {
    const extraOk = elim && habraExtra === true && ea !== '' && eb !== '';
    const marcadorExtra = extraOk ? { golesA: parseInt(ea, 10), golesB: parseInt(eb, 10) } : null;
    const pred = {
      marcador90: { golesA, golesB },
      habraExtra: elim ? habraExtra : undefined,
      marcadorExtra,
      ganadorFinal: elim ? ganador : undefined,
    };
    const result = {
      marcador90: { golesA, golesB },
      huboExtra: elim ? habraExtra ?? undefined : undefined,
      marcadorExtra,
      ganadorFinal: elim ? ganador : undefined,
    };
    maximo = calcularPuntos(pred, result, fase, config).total;
  }

  const fmt = (v: number) => `${v} × ${mult} = ${v * mult}`;

  return (
    <div className="card p-4 space-y-1">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-sm">Puntos en juego</h3>
        {mult > 1 && <span className="text-[11px] text-brand">Fase ×{mult}</span>}
      </div>

      {tieneMarcador && (
        <div className="rounded-xl bg-brand/10 ring-1 ring-brand/30 p-3 text-center mb-2">
          <p className="text-xs text-slate-300">Máximo si tu pronóstico es exacto</p>
          <p className="text-3xl font-bold text-brand tabular-nums">{maximo}</p>
          <p className="text-[11px] text-slate-400">puntos</p>
        </div>
      )}

      <Razon texto="🎯 Marcador exacto (90′)" detalle={fmt(config.base.marcadorExacto)} />
      <Razon texto="✓ Acertar quién gana o si empatan" detalle={fmt(config.base.resultado1X2)} />
      <Razon texto="✓ Acertar total de goles" detalle={fmt(config.base.totalGoles)} />

      {elim && (
        <>
          <Razon texto="⏱️ Acertar si hay tiempo extra" detalle={fmt(config.extras.acertarHuboExtra)} activo={habraExtra !== null} />
          <Razon texto="🎯 Marcador exacto del extra" detalle={fmt(config.extras.marcadorExtraExacto)} activo={habraExtra === true} />
          <Razon texto="🏅 Acertar ganador final" detalle={fmt(config.extras.ganadorFinal)} activo={ganador !== null} />
        </>
      )}

      <p className="text-[11px] text-slate-500 pt-1">
        El marcador exacto ya incluye el resultado y el total (no se suman). Todo se multiplica por la
        fase{elim ? '; los extras solo cuentan si los pronosticas' : ''}.
      </p>
    </div>
  );
}

function Razon({ texto, detalle, activo = true }: { texto: string; detalle: string; activo?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 border-t border-white/5 ${activo ? '' : 'opacity-40'}`}>
      <span className="text-sm text-slate-300">{texto}</span>
      <span className="text-sm font-semibold text-slate-200 tabular-nums shrink-0 ml-3">{detalle}</span>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex-1">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <button disabled={disabled} onClick={() => onChange(true)}
          className={`btn ${value === true ? 'bg-brand text-white' : 'bg-white/5'}`}>Sí</button>
        <button disabled={disabled} onClick={() => onChange(false)}
          className={`btn ${value === false ? 'bg-brand text-white' : 'bg-white/5'}`}>No</button>
      </div>
    </div>
  );
}
