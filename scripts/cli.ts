import {
  canonicalJson,
  computeRecordHash,
  verifyTrailChain,
} from '../src/lib/crypto-trail';
import {
  readTrailRecords,
  runAutonomousCycle,
} from '../src/lib/engine-store';
import {
  detectNarrativeConvergences,
  runBullBearDebates,
  screenTokenCandidates,
} from '../src/lib/intelligence';
import {
  getSqliteDiagnosticsCount,
  loadReplayBundlesFromSqlite,
} from '../src/lib/sqlite-db';

async function main() {
  const cmd = process.argv[2] || 'verify';

  if (cmd === 'cycle') {
    console.log(
      '[CYCLE] Running live Frimin v2.0 observation, RPC, L2 orderbook & practice-trade cycle...'
    );
    const { state, trail, verification } = await runAutonomousCycle();
    const d = state.lastSourceDiagnostics;
    console.log(
      `[OK] Frimin Cycle #${state.cycleCount} completed in ${d.cycleDurationMs}ms`
    );
    console.log(
      `  - Live Markets & L2 Books: ${state.markets.length} markets (CB: ${d.coinbaseMarketsOk}, Kraken: ${d.krakenPairsOk}, HL Perps: ${d.hyperliquidAssetsOk}, L2 Books: ${d.l2OrderBooksOk})`
    );
    console.log(
      `  - Direct Blockchain RPC:   Ethereum Block #${d.ethBlockNumber?.toLocaleString()} (${d.ethGasGwei} Gwei), Solana Slot #${d.solanaSlot?.toLocaleString()}, ${d.onChainWhaleLogsOk} live ERC-20 whale logs`
    );
    console.log(
      `  - Live KOL & RSS Feeds:    ${d.liveVoicesFetched}/20 active voices (${state.signals.length} signals stored)`
    );
    console.log(
      `  - Convergence Clusters:    ${state.convergences.length} (${state.convergences.filter((c) => c.passesThreshold).length} qualified)`
    );
    console.log(
      `  - Practice Positions:      ${state.positions.filter((p) => p.status === 'OPEN').length} open, ${state.positions.filter((p) => p.status !== 'OPEN').length} settled`
    );
    console.log(
      `  - SQLite + Ed25519 Trail:  ${verification.valid ? 'VALID' : 'BROKEN'} (${trail.length} blocks, ${verification.ed25519SignaturesVerified} Ed25519 sigs, ${d.sqliteRowsCount} SQLite rows)`
    );
    return;
  }

  if (cmd === 'verify') {
    const records = readTrailRecords();
    if (records.length === 0) {
      console.log('[INFO] No trail records yet. Run `npm run cycle` first.');
      return;
    }
    const report = verifyTrailChain(records);
    const sqliteDiag = getSqliteDiagnosticsCount();
    let recomputedExact = 0;
    for (const r of records) {
      if (computeRecordHash(r) === r.hash) recomputedExact++;
    }

    console.log('==========================================================');
    console.log(' FRIMIN CRYPTOGRAPHIC TRAIL & SQLITE VERIFICATION REPORT');
    console.log('==========================================================');
    console.log(
      `Chain Integrity:        ${report.valid ? 'PASSED' : 'FAILED'}`
    );
    console.log(`Blocks Verified:        ${report.checkedRecords}`);
    console.log(
      `SHA-256 Re-Derivations: ${recomputedExact}/${records.length} exact matches`
    );
    console.log(
      `Ed25519 Signatures:     ${report.ed25519SignaturesVerified}/${records.length} verified`
    );
    console.log(`Causal Links Checked:   ${report.deterministicReplayChecked}`);
    console.log(
      `SQLite WAL Database:    ${sqliteDiag.trailCount} blocks, ${sqliteDiag.snapshotsCount} market snapshots, ${sqliteDiag.signalsCount} signals`
    );
    console.log(`Genesis Hash:           ${report.genesisHash}`);
    console.log(`Head Hash:              ${report.headHash}`);
    if (!report.valid) {
      console.error(
        `Error at block #${report.brokenAtIndex}: ${report.errorDetail}`
      );
      process.exit(1);
    }
    return;
  }

  if (cmd === 'replay') {
    const bundles = loadReplayBundlesFromSqlite();
    if (bundles.length === 0) {
      console.log(
        '[INFO] No replay bundles stored yet. Run `npm run cycle` first.'
      );
      return;
    }

    console.log('==========================================================');
    console.log(' FRIMIN DETERMINISTIC BIT-FOR-BIT ENGINE REPLAY');
    console.log('==========================================================');

    for (const b of bundles) {
      const marketMap = new Map(b.markets.map((m) => [m.symbol, m]));
      const replayedConv = detectNarrativeConvergences(
        b.signals,
        marketMap,
        b.riskConfig,
        b.recordedAt
      );
      const replayedDebates = runBullBearDebates(
        b.markets,
        replayedConv,
        b.newsVerifications,
        b.whaleVerdicts,
        b.recordedAt
      );
      const replayedHunter =
        b.dexPairs.length > 0 ? screenTokenCandidates(b.dexPairs) : [];

      const convIdentical =
        canonicalJson(replayedConv) === canonicalJson(b.expectedConvergences);
      const debateIdentical =
        canonicalJson(replayedDebates) === canonicalJson(b.expectedDebates);
      const hunterIdentical =
        canonicalJson(replayedHunter) ===
        canonicalJson(b.expectedHunterCandidates);

      console.log(`Cycle [${b.cycleId}] @ ${b.recordedAt}:`);
      console.log(
        `  - Multi-Voice Convergence Replay: ${convIdentical ? '100% IDENTICAL' : 'MISMATCH'} (${replayedConv.length} clusters)`
      );
      console.log(
        `  - Bull/Bear + Judge Replay:       ${debateIdentical ? '100% IDENTICAL' : 'MISMATCH'} (${replayedDebates.length} debates)`
      );
      console.log(
        `  - Token Scanner Gates Replay:     ${hunterIdentical ? '100% IDENTICAL' : 'MISMATCH'} (${replayedHunter.length} pairs)`
      );

      if (!convIdentical || !debateIdentical || !hunterIdentical) {
        process.exit(1);
      }
    }
    return;
  }

  console.error(`Unknown command: ${cmd}. Use: cycle | verify | replay`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
