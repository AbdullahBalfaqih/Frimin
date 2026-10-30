import type DatabaseType from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { RawDexPair } from './live-sources';
import { getWritableDataDir } from './runtime-paths';
import {
  BullBearDebate,
  ConvergenceCluster,
  MarketSnapshot,
  NewsVerification,
  ParsedKOLSignal,
  PracticePosition,
  RiskConfig,
  TokenHunterCandidate,
  TrailRecord,
  WhaleAlertVerdict,
} from './types';

export interface CycleReplayBundle {
  cycleId: string;
  recordedAt: string;
  riskConfig: RiskConfig;
  markets: MarketSnapshot[];
  signals: ParsedKOLSignal[];
  newsVerifications: NewsVerification[];
  whaleVerdicts: WhaleAlertVerdict[];
  dexPairs: RawDexPair[];
  expectedConvergences: ConvergenceCluster[];
  expectedDebates: BullBearDebate[];
  expectedHunterCandidates: TokenHunterCandidate[];
}

interface ServerlessMirrorStore {
  trailBlocks: Record<number, TrailRecord>;
  marketSnapshotsCount: number;
  kolSignals: Record<string, ParsedKOLSignal>;
  practicePositions: Record<string, PracticePosition>;
  replayBundles: CycleReplayBundle[];
}

let dbInstance: DatabaseType.Database | null = null;
let nativeSqliteUnavailable = false;

function getDbPath(): string {
  return path.join(getWritableDataDir(), 'frimin.db');
}

function getMirrorPath(): string {
  return path.join(getWritableDataDir(), 'frimin-sqlite-mirror.json');
}

function readMirrorStore(): ServerlessMirrorStore {
  const p = getMirrorPath();
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8')) as ServerlessMirrorStore;
    } catch {
      // Reinitialize if unreadable
    }
  }
  return {
    trailBlocks: {},
    marketSnapshotsCount: 0,
    kolSignals: {},
    practicePositions: {},
    replayBundles: [],
  };
}

function writeMirrorStore(store: ServerlessMirrorStore): void {
  const p = getMirrorPath();
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store), 'utf8');
  fs.renameSync(tmp, p);
}

export function getSqliteDb(): DatabaseType.Database {
  if (dbInstance) return dbInstance;
  const dataDir = getWritableDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSqlite3 = require('better-sqlite3') as typeof DatabaseType;
  const db = new BetterSqlite3(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS trail_blocks (
      idx INTEGER PRIMARY KEY,
      hash TEXT NOT NULL UNIQUE,
      prev_hash TEXT NOT NULL,
      kind TEXT NOT NULL,
      cycle_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      summary TEXT NOT NULL,
      caused_by_hash TEXT,
      signature TEXT,
      signer_pub TEXT,
      record_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      spot_price REAL NOT NULL,
      vwap_24h REAL NOT NULL,
      rsi_14 REAL NOT NULL,
      macd_hist REAL NOT NULL,
      spread_pct REAL NOT NULL,
      l2_spread_bps REAL,
      evidence_hash TEXT NOT NULL,
      observed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kol_signals (
      post_hash TEXT PRIMARY KEY,
      voice_id TEXT NOT NULL,
      handle TEXT NOT NULL,
      platform TEXT NOT NULL,
      published_at TEXT NOT NULL,
      signal_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS practice_positions (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      strategy TEXT NOT NULL,
      status TEXT NOT NULL,
      entry_price REAL NOT NULL,
      notional_usd REAL NOT NULL,
      opened_at TEXT NOT NULL,
      position_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replay_bundles (
      cycle_id TEXT PRIMARY KEY,
      recorded_at TEXT NOT NULL,
      bundle_json TEXT NOT NULL
    );
  `);

  dbInstance = db;
  return db;
}

function tryGetSqliteDb(): DatabaseType.Database | null {
  if (nativeSqliteUnavailable) return null;
  try {
    return getSqliteDb();
  } catch {
    nativeSqliteUnavailable = true;
    return null;
  }
}

export function resetSqliteLedger(): void {
  const db = tryGetSqliteDb();
  if (!db) {
    writeMirrorStore({
      trailBlocks: {},
      marketSnapshotsCount: 0,
      kolSignals: {},
      practicePositions: {},
      replayBundles: [],
    });
    return;
  }
  db.exec(`
    DELETE FROM trail_blocks;
    DELETE FROM market_snapshots;
    DELETE FROM kol_signals;
    DELETE FROM practice_positions;
    DELETE FROM replay_bundles;
  `);
}

export function syncCycleToSqlite(params: {
  cycleId: string;
  trailRecords: TrailRecord[];
  markets: MarketSnapshot[];
  signals: ParsedKOLSignal[];
  positions: PracticePosition[];
  replayBundle?: CycleReplayBundle;
}): number {
  const db = tryGetSqliteDb();
  if (!db) {
    const store = readMirrorStore();
    for (const r of params.trailRecords) {
      store.trailBlocks[r.index] = r;
    }
    store.marketSnapshotsCount += params.markets.length;
    for (const s of params.signals) {
      store.kolSignals[s.postHash] = s;
    }
    for (const p of params.positions) {
      store.practicePositions[p.id] = p;
    }
    if (params.replayBundle) {
      store.replayBundles = [
        params.replayBundle,
        ...store.replayBundles.filter(
          (b) => b.cycleId !== params.replayBundle!.cycleId
        ),
      ].slice(0, 10);
    }
    writeMirrorStore(store);
    return (
      Object.keys(store.trailBlocks).length +
      store.marketSnapshotsCount +
      Object.keys(store.kolSignals).length +
      Object.keys(store.practicePositions).length
    );
  }

  const insertTrail = db.prepare(`
    INSERT OR REPLACE INTO trail_blocks
      (idx, hash, prev_hash, kind, cycle_id, timestamp, summary, caused_by_hash, signature, signer_pub, record_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMarket = db.prepare(`
    INSERT INTO market_snapshots
      (cycle_id, symbol, spot_price, vwap_24h, rsi_14, macd_hist, spread_pct, l2_spread_bps, evidence_hash, observed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const upsertSignal = db.prepare(`
    INSERT OR REPLACE INTO kol_signals
      (post_hash, voice_id, handle, platform, published_at, signal_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const upsertPosition = db.prepare(`
    INSERT OR REPLACE INTO practice_positions
      (id, symbol, side, strategy, status, entry_price, notional_usd, opened_at, position_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const upsertReplay = db.prepare(`
    INSERT OR REPLACE INTO replay_bundles
      (cycle_id, recorded_at, bundle_json)
    VALUES (?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const r of params.trailRecords) {
      insertTrail.run(
        r.index,
        r.hash,
        r.prevHash,
        r.kind,
        r.cycleId,
        r.timestamp,
        r.summary,
        r.causedByHash ?? null,
        r.signature ?? null,
        r.signerPublicKey ?? null,
        JSON.stringify(r)
      );
    }

    for (const m of params.markets) {
      insertMarket.run(
        params.cycleId,
        m.symbol,
        m.spotPrice,
        m.vwap24h,
        m.rsi14,
        m.macdHistogram,
        m.crossVenueSpreadPct,
        m.l2SpreadBps ?? null,
        m.rawEvidenceHash,
        m.observedAt
      );
    }

    for (const s of params.signals) {
      upsertSignal.run(
        s.postHash,
        s.voiceId,
        s.handle,
        s.platform,
        s.publishedAt,
        JSON.stringify(s)
      );
    }

    for (const p of params.positions) {
      upsertPosition.run(
        p.id,
        p.symbol,
        p.side,
        p.strategy,
        p.status,
        p.entryPrice,
        p.notionalUsd,
        p.openedAt,
        JSON.stringify(p)
      );
    }

    if (params.replayBundle) {
      upsertReplay.run(
        params.replayBundle.cycleId,
        params.replayBundle.recordedAt,
        JSON.stringify(params.replayBundle)
      );
    }
  });

  tx();

  const counts = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM trail_blocks) +
        (SELECT COUNT(*) FROM market_snapshots) +
        (SELECT COUNT(*) FROM kol_signals) +
        (SELECT COUNT(*) FROM practice_positions) AS total`
    )
    .get() as { total: number };
  return counts.total;
}

export function loadReplayBundlesFromSqlite(): CycleReplayBundle[] {
  const db = tryGetSqliteDb();
  if (!db) {
    return readMirrorStore().replayBundles;
  }
  const rows = db
    .prepare(
      `SELECT bundle_json FROM replay_bundles ORDER BY rowid DESC LIMIT 10`
    )
    .all() as { bundle_json: string }[];
  return rows.map((r) => JSON.parse(r.bundle_json) as CycleReplayBundle);
}

export function getSqliteDiagnosticsCount(): {
  trailCount: number;
  snapshotsCount: number;
  signalsCount: number;
  positionsCount: number;
  replayBundlesCount: number;
} {
  const db = tryGetSqliteDb();
  if (!db) {
    const store = readMirrorStore();
    return {
      trailCount: Object.keys(store.trailBlocks).length,
      snapshotsCount: store.marketSnapshotsCount,
      signalsCount: Object.keys(store.kolSignals).length,
      positionsCount: Object.keys(store.practicePositions).length,
      replayBundlesCount: store.replayBundles.length,
    };
  }
  return db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM trail_blocks) AS trailCount,
        (SELECT COUNT(*) FROM market_snapshots) AS snapshotsCount,
        (SELECT COUNT(*) FROM kol_signals) AS signalsCount,
        (SELECT COUNT(*) FROM practice_positions) AS positionsCount,
        (SELECT COUNT(*) FROM replay_bundles) AS replayBundlesCount`
    )
    .get() as {
    trailCount: number;
    snapshotsCount: number;
    signalsCount: number;
    positionsCount: number;
    replayBundlesCount: number;
  };
}
