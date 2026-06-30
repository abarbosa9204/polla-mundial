/**
 * Tests del orquestador de scoring: desglose provisional vs confirmado,
 * construcción de tabla con desempates y movimiento, y bonos de torneo.
 */
import { describe, it, expect } from 'vitest';
import {
  CONFIG_PUNTOS_DEFAULT as CFG,
  type ResultadoOficial,
} from '@polla/core';
import {
  computarDesgloseUsuario,
  computarDesglosesPartido,
  construirTablaPosiciones,
  computarBonosUsuario,
  proyectarClasificadosVivo,
  clasificadosDesdeCuadro,
  type PartidoScoring,
  type UsuarioTabla,
  type DesgloseCalculado,
  type PartidoProyeccion,
} from '../src/scoring/index.js';

const resFinal = (a: number, b: number): ResultadoOficial => ({
  marcador90: { golesA: a, golesB: b },
  huboExtra: false,
  marcadorExtra: null,
  ganadorFinal: null,
});

describe('Desglose: provisional vs confirmado según estado', () => {
  const partidoBase: Omit<PartidoScoring, 'estado'> = {
    id: 'M1',
    fase: 'GRUPOS',
    resultado: resFinal(2, 1),
    resultadoProvisional: resFinal(1, 0),
  };

  it('FINISHED ⇒ confirmado con el resultado oficial', () => {
    const d = computarDesgloseUsuario(
      { ...partidoBase, estado: 'FINISHED' },
      { userId: 'u1', pronostico: { marcador90: { golesA: 2, golesB: 1 } } },
      CFG,
    )!;
    expect(d.provisional).toBe(false);
    expect(d.desglose.marcadorExacto).toBe(true);
    expect(d.puntos).toBe(5);
  });

  it('IN_PLAY ⇒ provisional con el marcador actual', () => {
    const d = computarDesgloseUsuario(
      { ...partidoBase, estado: 'IN_PLAY' },
      { userId: 'u1', pronostico: { marcador90: { golesA: 2, golesB: 1 } } },
      CFG,
    )!;
    expect(d.provisional).toBe(true);
    // marcador actual 1-0: gana A (acierta 1X2) pero no exacto ni total
    expect(d.desglose.marcadorExacto).toBe(false);
    expect(d.desglose.resultado1X2).toBe(true);
    expect(d.puntos).toBe(3);
  });

  it('SCHEDULED ⇒ no puntúa todavía (null)', () => {
    const d = computarDesgloseUsuario(
      { ...partidoBase, estado: 'SCHEDULED' },
      { userId: 'u1', pronostico: { marcador90: { golesA: 0, golesB: 0 } } },
      CFG,
    );
    expect(d).toBeNull();
  });

  it('usuario sin pronóstico en partido FINISHED ⇒ 0 puntos', () => {
    const d = computarDesgloseUsuario(
      { ...partidoBase, estado: 'FINISHED' },
      { userId: 'u2', pronostico: null },
      CFG,
    )!;
    expect(d.puntos).toBe(0);
    expect(d.desglose.sinPronostico).toBe(true);
  });
});

describe('Tabla de posiciones: agregación, desempate y movimiento', () => {
  it('separa confirmados de provisionales y ordena por total', () => {
    const usuarios: UsuarioTabla[] = [
      { userId: 'u1', displayName: 'Ana', timestampCampeon: 1000, puntosBonos: 0 },
      { userId: 'u2', displayName: 'Beto', timestampCampeon: 2000, puntosBonos: 0 },
    ];
    const desgloses: DesgloseCalculado[] = [
      // Ana: 5 confirmados (exacto)
      {
        userId: 'u1',
        partidoId: 'M1',
        provisional: false,
        puntos: 5,
        desglose: { marcadorExacto: true, resultado1X2: true } as never,
      },
      // Beto: 3 provisionales
      {
        userId: 'u2',
        partidoId: 'M2',
        provisional: true,
        puntos: 3,
        desglose: { marcadorExacto: false, resultado1X2: true } as never,
      },
    ];
    const tabla = construirTablaPosiciones(usuarios, desgloses);
    expect(tabla[0]!.userId).toBe('u1');
    expect(tabla[0]!.puntosConfirmados).toBe(5);
    expect(tabla[0]!.puntosProvisionales).toBe(0);
    expect(tabla[0]!.marcadoresExactos).toBe(1);
    expect(tabla[1]!.userId).toBe('u2');
    expect(tabla[1]!.puntosConfirmados).toBe(0);
    expect(tabla[1]!.puntosProvisionales).toBe(3);
    // exactos/1x2 NO cuentan provisionales en los contadores de desempate
    expect(tabla[1]!.marcadoresExactos).toBe(0);
  });

  it('desempata por marcadores exactos cuando hay igualdad de puntos', () => {
    const usuarios: UsuarioTabla[] = [
      { userId: 'u1', displayName: 'Ana', timestampCampeon: 1, puntosBonos: 0 },
      { userId: 'u2', displayName: 'Beto', timestampCampeon: 1, puntosBonos: 0 },
    ];
    const desgloses: DesgloseCalculado[] = [
      { userId: 'u1', partidoId: 'M1', provisional: false, puntos: 5,
        desglose: { marcadorExacto: true, resultado1X2: true } as never },
      { userId: 'u2', partidoId: 'M1', provisional: false, puntos: 5,
        desglose: { marcadorExacto: false, resultado1X2: true } as never },
    ];
    const tabla = construirTablaPosiciones(usuarios, desgloses);
    // Mismos 5 pts, pero Ana tiene 1 exacto ⇒ Ana primera
    expect(tabla[0]!.userId).toBe('u1');
    expect(tabla[0]!.posicion).toBe(1);
  });

  it('calcula movimiento ▲▼ respecto a posiciones anteriores', () => {
    const usuarios: UsuarioTabla[] = [
      { userId: 'u1', displayName: 'Ana', timestampCampeon: 1, puntosBonos: 0 },
      { userId: 'u2', displayName: 'Beto', timestampCampeon: 1, puntosBonos: 0 },
    ];
    const desgloses: DesgloseCalculado[] = [
      { userId: 'u1', partidoId: 'M1', provisional: false, puntos: 10,
        desglose: { marcadorExacto: false, resultado1X2: false } as never },
      { userId: 'u2', partidoId: 'M1', provisional: false, puntos: 3,
        desglose: { marcadorExacto: false, resultado1X2: true } as never },
    ];
    // Antes: Beto 1º, Ana 2º. Ahora Ana sube a 1º.
    const previas = new Map([
      ['u1', { posicion: 2, movimiento: 0 }],
      ['u2', { posicion: 1, movimiento: 0 }],
    ]);
    const tabla = construirTablaPosiciones(usuarios, desgloses, previas);
    const ana = tabla.find((f) => f.userId === 'u1')!;
    const beto = tabla.find((f) => f.userId === 'u2')!;
    expect(ana.posicion).toBe(1);
    expect(ana.movimiento).toBe(1); // subió de 2 a 1
    expect(beto.movimiento).toBe(-1); // bajó de 1 a 2
  });

  it('el movimiento PERSISTE si la posición no cambió', () => {
    const usuarios: UsuarioTabla[] = [
      { userId: 'u1', displayName: 'Ana', timestampCampeon: 1, puntosBonos: 0 },
      { userId: 'u2', displayName: 'Beto', timestampCampeon: 1, puntosBonos: 0 },
    ];
    const desgloses: DesgloseCalculado[] = [
      { userId: 'u1', partidoId: 'M1', provisional: false, puntos: 10,
        desglose: { marcadorExacto: false, resultado1X2: false } as never },
      { userId: 'u2', partidoId: 'M1', provisional: false, puntos: 3,
        desglose: { marcadorExacto: false, resultado1X2: true } as never },
    ];
    // Ana ya estaba 1ª con un ▲1 previo; sigue 1ª ⇒ debe MANTENER el ▲1 (no "–").
    const previas = new Map([
      ['u1', { posicion: 1, movimiento: 1 }],
      ['u2', { posicion: 2, movimiento: -1 }],
    ]);
    const tabla = construirTablaPosiciones(usuarios, desgloses, previas);
    expect(tabla.find((f) => f.userId === 'u1')!.movimiento).toBe(1); // persiste ▲1
    expect(tabla.find((f) => f.userId === 'u2')!.movimiento).toBe(-1); // persiste ▼1
  });

  it('incluye bonos en los puntos confirmados', () => {
    const usuarios: UsuarioTabla[] = [
      { userId: 'u1', displayName: 'Ana', timestampCampeon: 1, puntosBonos: 20 },
    ];
    const tabla = construirTablaPosiciones(usuarios, []);
    expect(tabla[0]!.puntosConfirmados).toBe(20);
    expect(tabla[0]!.puntosTotales).toBe(20);
  });
});

describe('Bonos de torneo agregados por usuario', () => {
  it('suma clasificados + campeón + goleador', () => {
    const r = computarBonosUsuario(
      {
        clasificados: { R32: ['ARG', 'BRA'], SEMIS: ['ARG'] },
        campeon: 'ARG',
        goleador: 'Messi',
      },
      {
        clasificados: {
          R32: new Set(['ARG', 'BRA', 'FRA']),
          SEMIS: new Set(['ARG', 'FRA']),
        },
        campeon: 'ARG',
        goleadores: ['Messi', 'Mbappe'], // empate de goleadores
      },
      CFG,
    );
    // R32: 2 aciertos ×1 = 2; SEMIS: 1 ×5 = 5; campeón 20; goleador 15 = 42
    expect(r.total).toBe(2 + 5 + 20 + 15);
  });

  it('rondas no resueltas no puntúan aún', () => {
    const r = computarBonosUsuario(
      { clasificados: { R32: ['ARG'] }, campeon: 'ARG', goleador: null },
      { clasificados: {}, campeon: null, goleadores: [] },
      CFG,
    );
    expect(r.total).toBe(0);
  });
});

describe('Lote completo de un partido', () => {
  it('computa desgloses de todos los usuarios incluyendo los sin pronóstico', () => {
    const partido: PartidoScoring = {
      id: 'M1', fase: 'FINAL', estado: 'FINISHED',
      resultado: resFinal(1, 0), resultadoProvisional: resFinal(1, 0),
    };
    const ds = computarDesglosesPartido(
      partido,
      [
        { userId: 'u1', pronostico: { marcador90: { golesA: 1, golesB: 0 } } },
        { userId: 'u2', pronostico: null },
      ],
      CFG,
    );
    expect(ds).toHaveLength(2);
    expect(ds.find((d) => d.userId === 'u1')!.puntos).toBe(25); // exacto ×5 en final
    expect(ds.find((d) => d.userId === 'u2')!.puntos).toBe(0);
  });
});

describe('Proyección de clasificados EN VIVO (bono parcial)', () => {
  const P = (o: Partial<PartidoProyeccion>): PartidoProyeccion => ({
    fase: 'GRUPOS', grupo: null, estado: 'FINISHED',
    equipo_a: null, equipo_b: null, goles_a_90: null, goles_b_90: null, ganador_final: null, ...o,
  });

  it('R32: solo cuenta partidos JUGADOS (FINISHED), equipos con pj>0', () => {
    const partidos = [
      P({ grupo: 'A', equipo_a: 'MEX', equipo_b: 'RSA', estado: 'FINISHED', goles_a_90: 2, goles_b_90: 0 }),
      // KOR-CZE EN JUEGO ⇒ NO debe contar para clasificados.
      P({ grupo: 'A', equipo_a: 'KOR', equipo_b: 'CZE', estado: 'IN_PLAY', goles_a_90: 1, goles_b_90: 0 }),
    ];
    const proy = proyectarClasificadosVivo(partidos);
    // Solo MEX y RSA jugaron ⇒ proyecta esos 2; KOR/CZE (en juego) NO.
    expect(proy.R32).toEqual(expect.arrayContaining(['MEX', 'RSA']));
    expect(proy.R32).not.toContain('KOR');
    expect(proy.R32).not.toContain('CZE');
  });

  it('R16: ganadores de R32 SOLO de partidos finalizados', () => {
    const partidos = [
      P({ fase: 'R32', estado: 'FINISHED', equipo_a: 'BRA', equipo_b: 'ARG', goles_a_90: 2, goles_b_90: 1 }),
      P({ fase: 'R32', estado: 'IN_PLAY', equipo_a: 'ESP', equipo_b: 'ITA', goles_a_90: 0, goles_b_90: 1 }),
      P({ fase: 'R32', estado: 'SCHEDULED', equipo_a: 'FRA', equipo_b: 'GER' }),
    ];
    const proy = proyectarClasificadosVivo(partidos);
    expect(proy.R16).toEqual(['BRA']); // solo el finalizado
  });
});

describe('clasificadosDesdeCuadro (consolidación del cuadro real)', () => {
  const P = (o: Partial<PartidoProyeccion>): PartidoProyeccion => ({
    fase: 'GRUPOS', grupo: null, estado: 'SCHEDULED',
    equipo_a: null, equipo_b: null, goles_a_90: null, goles_b_90: null, ganador_final: null, ...o,
  });

  it('FINAL completa (2 equipos) ⇒ consolida los finalistas', () => {
    const out = clasificadosDesdeCuadro([P({ fase: 'FINAL', equipo_a: 'ARG', equipo_b: 'FRA' })]);
    expect(new Set(out.FINAL)).toEqual(new Set(['ARG', 'FRA']));
  });

  it('llave incompleta (falta un equipo del cupo) ⇒ NO consolida esa ronda', () => {
    // FINAL con un solo equipo definido: 1 ≠ cupo(2) ⇒ no se consolida.
    const out = clasificadosDesdeCuadro([P({ fase: 'FINAL', equipo_a: 'ARG', equipo_b: null })]);
    expect(out.FINAL).toBeUndefined();
  });

  it('SEMIS completa (4 equipos en 2 partidos) ⇒ consolida los 4', () => {
    const out = clasificadosDesdeCuadro([
      P({ fase: 'SEMIS', equipo_a: 'ARG', equipo_b: 'FRA' }),
      P({ fase: 'SEMIS', equipo_a: 'BRA', equipo_b: 'ESP' }),
    ]);
    expect(new Set(out.SEMIS)).toEqual(new Set(['ARG', 'FRA', 'BRA', 'ESP']));
  });

  it('SEMIS a medio resolver (solo 2 de 4) ⇒ NO consolida', () => {
    const out = clasificadosDesdeCuadro([
      P({ fase: 'SEMIS', equipo_a: 'ARG', equipo_b: 'FRA' }),
      P({ fase: 'SEMIS', equipo_a: null, equipo_b: null }),
    ]);
    expect(out.SEMIS).toBeUndefined();
  });

  it('rondas sin partidos no aparecen; el tercer puesto se ignora', () => {
    const out = clasificadosDesdeCuadro([
      P({ fase: 'FINAL', equipo_a: 'ARG', equipo_b: 'FRA' }),
      P({ fase: 'TERCER_PUESTO', equipo_a: 'BRA', equipo_b: 'ESP' }),
    ]);
    expect(out.SEMIS).toBeUndefined();
    expect(out.CUARTOS).toBeUndefined();
    expect(out.TERCER_PUESTO).toBeUndefined();
  });
});
