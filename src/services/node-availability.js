async function recordNodeHeartbeat(pool, nodeId) {
  const result = await pool.query(
    `UPDATE nodes
     SET status = 'online', last_seen_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [nodeId],
  );
  return result.rowCount > 0;
}

async function markExpiredNodesOffline(pool, timeoutSeconds) {
  return pool.query(
    `WITH cutoff AS (
       SELECT NOW() - ($1::double precision * INTERVAL '1 second') AS expires_at
     )
     UPDATE nodes AS node
     SET status = 'offline'
     FROM cutoff
     WHERE node.status = 'online'
       AND node.last_seen_at IS NOT NULL
       AND node.last_seen_at < cutoff.expires_at
     RETURNING node.id, node.name`,
    [timeoutSeconds],
  );
}

function createAvailabilityChecker({
  pool,
  timeoutSeconds,
  intervalSeconds,
  logger = console,
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  let timer = null;
  let runningCheck = null;
  let started = false;
  let stopped = false;

  async function check() {
    try {
      const result = await markExpiredNodesOffline(pool, timeoutSeconds);
      for (const node of result.rows) {
        logger.log(`Node ${node.name} is now offline`);
      }
    } catch (error) {
      logger.error("Availability check failed:", error.message);
    }
  }

  function scheduleNext() {
    if (stopped) return;
    timer = schedule(async () => {
      timer = null;
      runningCheck = check();
      await runningCheck;
      runningCheck = null;
      scheduleNext();
    }, intervalSeconds * 1000);
  }

  return {
    start() {
      if (started || stopped) return;
      started = true;
      scheduleNext();
    },
    async stop() {
      stopped = true;
      if (timer !== null) {
        cancel(timer);
        timer = null;
      }
      if (runningCheck) {
        await runningCheck;
      }
    },
  };
}

module.exports = {
  recordNodeHeartbeat,
  markExpiredNodesOffline,
  createAvailabilityChecker,
};
